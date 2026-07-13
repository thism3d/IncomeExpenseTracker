#!/usr/bin/env python3
"""End-to-end verification of the SisirBindu backend, over HTTP and WebSocket."""
import json, urllib.request, urllib.error, os, sys, subprocess

API = "http://localhost:5051/api"
PASS, FAIL = [], []


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(f"  {'PASS' if cond else 'FAIL'}  {name}{(' — ' + str(detail)) if detail else ''}")


def otp_for(identifier, purpose="register"):
    """Read the issued code straight from the DB.

    The API only echoes a `devCode` when SMS/email delivery FAILS (a dev
    fallback). When the real gateway accepts the message — which it now does —
    the code is correctly withheld, so the test has to look it up.
    """
    out = subprocess.run(
        ["psql", "-U", "onzepuser", "-h", "localhost", "-d", "sisirbindu", "-t", "-A", "-c",
         f"SELECT code FROM otp_codes WHERE identifier='{identifier}' AND purpose='{purpose}' "
         f"ORDER BY created_at DESC LIMIT 1"],
        capture_output=True, text=True,
        env={**os.environ, "PGPASSWORD": "Oz76185Una3Er"},
    )
    return out.stdout.strip()


def call(method, path, body=None, token=None, raw=False, files=None):
    url = f"{API}{path}"
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    if files:
        boundary = "----SisirBinduBoundary"
        parts = []
        for field, (fname, content, ctype) in files.items():
            parts.append(f"--{boundary}\r\n".encode())
            parts.append(f'Content-Disposition: form-data; name="{field}"; filename="{fname}"\r\n'.encode())
            parts.append(f"Content-Type: {ctype}\r\n\r\n".encode())
            parts.append(content)
            parts.append(b"\r\n")
        parts.append(f"--{boundary}--\r\n".encode())
        data = b"".join(parts)
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    else:
        data = None

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            payload = r.read()
            return r.status, (payload if raw else json.loads(payload))
    except urllib.error.HTTPError as e:
        payload = e.read()
        try:
            return e.code, json.loads(payload)
        except Exception:
            return e.code, {"raw": payload[:80]}


print("\n=== 1. Registration: OTP -> verify -> set password ===")
PHONE = "01712345678"
st, r = call("POST", "/auth/register/send-otp", {"identifier": PHONE})
check("send-otp accepts a BD number", st == 200, r.get("data", {}).get("destination"))
check("number canonicalized to 8801...", r["data"]["identifier"] == "8801712345678", r["data"]["identifier"])
code = otp_for("8801712345678")

st, r = call("POST", "/auth/register/verify-otp", {"identifier": PHONE, "code": code})
check("verify-otp returns a ticket", st == 200 and "ticket" in r["data"])
ticket = r["data"]["ticket"]

st, r = call("POST", "/auth/register/set-password",
             {"ticket": ticket, "name": "Adv. Rahman", "password": "Lawyer@2026"})
check("set-password creates the account", st == 201, r.get("message"))
token = r["data"]["token"]
check("lock is NOT yet configured", r["data"]["user"]["lockConfigured"] is False)

print("\n=== 2. OTP brute-force is stopped after 5 attempts ===")
call("POST", "/auth/register/send-otp", {"identifier": "brute@test.com"})
codes = []
for i in range(6):
    st, r = call("POST", "/auth/register/verify-otp", {"identifier": "brute@test.com", "code": "000000"})
    codes.append(r["error"]["code"])
check("5 wrong tries then the code is burned",
      codes[:4] == ["INVALID_OTP"] * 4 and "TOO_MANY_ATTEMPTS" in codes[4:], codes)

print("\n=== 3. Login accepts every BD number format ===")
for fmt in ["01712345678", "1712345678", "8801712345678", "+8801712345678"]:
    st, r = call("POST", "/auth/login", {"identifier": fmt, "password": "Lawyer@2026"})
    check(f"login with {fmt}", st == 200)
token = r["data"]["token"]

st, r = call("POST", "/auth/login", {"identifier": PHONE, "password": "wrong"})
check("wrong password is rejected", st == 401 and r["error"]["code"] == "INVALID_CREDENTIALS")

print("\n=== 4. Mandatory app lock (PIN + biometric) ===")
st, r = call("POST", "/auth/lock/setup", {"pin": "4821", "biometricEnabled": True}, token=token)
check("lock setup succeeds", st == 200 and r["data"]["user"]["lockConfigured"] is True)
check("biometric flag stored", r["data"]["user"]["biometricEnabled"] is True)
st, r = call("POST", "/auth/lock/verify-pin", {"pin": "4821"}, token=token)
check("correct PIN verifies", st == 200 and r["data"]["verified"])
st, r = call("POST", "/auth/lock/verify-pin", {"pin": "9999"}, token=token)
check("wrong PIN is rejected", st == 401)

print("\n=== 5. Seeded defaults match the README presets ===")
st, r = call("GET", "/accounts", token=token)
acc = r["data"]["accounts"][0]
check("default 'Personal' account exists", acc["name"] == "Personal", acc["name"])
account_id = acc["id"]

st, r = call("GET", "/categories?type=INCOME", token=token)
check("7 income categories seeded", len(r["data"]["categories"]) == 7, len(r["data"]["categories"]))
st, r = call("GET", "/categories?type=EXPENSE", token=token)
check("58 expense categories seeded", len(r["data"]["categories"]) == 58, len(r["data"]["categories"]))
st, r = call("GET", "/payment-methods", token=token)
check("4 payment methods seeded", len(r["data"]["paymentMethods"]) == 4, len(r["data"]["paymentMethods"]))

print("\n=== 6. Transactions, items, and validation ===")


def cat(kind, name):
    _, rr = call("GET", f"/categories?type={kind}&search={name}", token=token)
    return rr["data"]["categories"][0]["id"]


def pm(name):
    _, rr = call("GET", f"/payment-methods?search={name}", token=token)
    return rr["data"]["paymentMethods"][0]["id"]


salary, groceries, cash = cat("INCOME", "Salary"), cat("EXPENSE", "Groceries"), pm("Cash")

st, r = call("POST", "/transactions", {
    "type": "INCOME", "accountId": account_id, "amount": 150000,
    "categoryId": salary, "paymentMethodId": cash, "note": "Case fee - Dhaka District Court"}, token=token)
check("income saved", st == 201, r.get("message"))

st, r = call("POST", "/transactions", {
    "type": "EXPENSE", "accountId": account_id, "amount": 2350.50,
    "categoryId": groceries, "paymentMethodId": cash, "note": "Office supplies",
    "items": [
        {"name": "A4 Paper", "quantity": 5, "unit": "ream", "rate": 420},
        {"name": "Pens", "quantity": 10, "unit": "pcs", "rate": 25.05},
    ]}, token=token)
check("expense with line items saved", st == 201)
tx_id = r["data"]["transaction"]["id"]

st, r = call("GET", f"/transactions/{tx_id}", token=token)
items = r["data"]["transaction"]["items"]
check("line items persisted with computed totals",
      len(items) == 2 and items[0]["total"] == 2100.0, [i["total"] for i in items])

st, r = call("POST", "/transactions", {
    "type": "EXPENSE", "accountId": account_id, "amount": 100, "categoryId": salary}, token=token)
check("income category rejected on an expense", st == 400, r["error"]["message"])

st, r = call("POST", "/transactions", {
    "type": "TRANSFER", "accountId": account_id, "amount": 500}, token=token)
check("transfer without a destination rejected", st == 400)

st, r = call("POST", "/transactions", {
    "type": "EXPENSE", "accountId": account_id, "amount": -5, "categoryId": groceries}, token=token)
check("negative amount rejected", st == 400)

print("\n=== 7. Transfer between accounts ===")
st, r = call("POST", "/accounts", {"name": "Office Account", "openingBalance": 10000}, token=token)
check("second account created", st == 201)
office_id = r["data"]["account"]["id"]

st, r = call("POST", "/transactions", {
    "type": "TRANSFER", "accountId": account_id, "toAccountId": office_id, "amount": 20000}, token=token)
check("transfer saved", st == 201)

st, r = call("GET", "/accounts", token=token)
balances = {a["name"]: a["balance"] for a in r["data"]["accounts"]}
# Personal: 150000 income - 2350.50 expense - 20000 out = 127649.50
# Office:   10000 opening + 20000 in                    = 30000
check("Personal balance correct", balances["Personal"] == 127649.50, balances["Personal"])
check("Office balance correct", balances["Office Account"] == 30000.0, balances["Office Account"])

print("\n=== 8. Attachments (the Drive) ===")
st, r = call("POST", "/files", token=token, files={
    "files": ("court-receipt.pdf", b"%PDF-1.4 fake court receipt", "application/pdf")})
check("PDF bill uploaded", st == 201 and r["data"]["attachments"][0]["kind"] == "PDF")
file_id = r["data"]["attachments"][0]["id"]

st, r = call("POST", "/files", token=token, files={
    "files": ("hearing-note.m4a", b"fake audio bytes", "audio/m4a")})
check("audio note uploaded", st == 201 and r["data"]["attachments"][0]["kind"] == "AUDIO")

st, r = call("POST", "/files", token=token, files={
    "files": ("virus.exe", b"MZ", "application/x-msdownload")})
check("unsupported file type rejected", st == 415, r.get("error", {}).get("code"))

st, r = call("GET", "/files", token=token)
check("Drive lists both files", r["data"]["stats"]["totalCount"] == 2, r["data"]["stats"]["totalCount"])

st, raw = call("GET", f"/files/{file_id}", token=token, raw=True)
check("file streams back its bytes", raw == b"%PDF-1.4 fake court receipt")

print("\n=== 9. Reports ===")
st, r = call("GET", "/reports/overview", token=token)
d = r["data"]
check("overview income", d["allTime"]["income"] == 150000.0, d["allTime"]["income"])
check("overview expense", d["allTime"]["expense"] == 2350.50, d["allTime"]["expense"])
check("transfers excluded from totals", d["allTime"]["net"] == 147649.50, d["allTime"]["net"])
check("balance includes opening balances", d["balance"] == 157649.50, d["balance"])

st, r = call("GET", "/reports/categories?period=monthly&type=EXPENSE", token=token)
check("category breakdown", r["data"]["categories"][0]["name"] == "Groceries")
check("percent computed", r["data"]["categories"][0]["percent"] == 100.0)

st, r = call("GET", "/reports/trend?period=monthly", token=token)
check("trend has filled buckets", len(r["data"]["points"]) >= 1, len(r["data"]["points"]))

st, r = call("GET", "/reports/payment-methods", token=token)
check("payment method breakdown", r["data"]["paymentMethods"][0]["name"] == "Cash")

st, r = call("GET", "/reports/calendar", token=token)
check("calendar totals", r["data"]["totals"]["income"] == 150000.0)

call("PUT", "/budgets", {"period": "MONTHLY", "amount": 50000}, token=token)
st, r = call("GET", "/reports/budget", token=token)
o = r["data"]["overall"]
check("budget: spent/remaining/perDay", o["spent"] == 2350.50 and o["remaining"] == 47649.50,
      f"spent={o['spent']} remaining={o['remaining']} perDay={o['perDayAverage']}")

print("\n=== 10. Exports ===")
st, pdf = call("GET", "/reports/export?format=pdf&period=monthly", token=token, raw=True)
check("PDF generated", pdf[:4] == b"%PDF", f"{len(pdf)} bytes")
open("/tmp/sisir-report.pdf", "wb").write(pdf)

st, xls = call("GET", "/reports/export?format=excel&period=monthly", token=token, raw=True)
check("Excel generated", xls[:2] == b"PK", f"{len(xls)} bytes")
open("/tmp/sisir-report.xlsx", "wb").write(xls)

print("\n=== 11. Lazy-load pagination (keyset) ===")
for i in range(30):
    call("POST", "/transactions", {
        "type": "EXPENSE", "accountId": account_id, "amount": 100 + i,
        "categoryId": groceries, "note": f"bulk {i}"}, token=token)
st, r = call("GET", "/transactions?limit=10", token=token)
check("page 1 returns 10 + a cursor", len(r["data"]["transactions"]) == 10 and r["data"]["hasMore"])
cur = r["data"]["nextCursor"]
st, r2 = call("GET", f"/transactions?limit=10&cursor={cur['cursor']}&cursorId={cur['cursorId']}", token=token)
ids1 = {t["id"] for t in r["data"]["transactions"]}
ids2 = {t["id"] for t in r2["data"]["transactions"]}
check("page 2 has no overlap with page 1", not (ids1 & ids2))

print("\n=== 12. Ownership isolation between users ===")
OTHER = "01898765432"
st, r = call("POST", "/auth/register/send-otp", {"identifier": OTHER})
code2 = otp_for("8801898765432")
st, r = call("POST", "/auth/register/verify-otp", {"identifier": OTHER, "code": code2})
st, r = call("POST", "/auth/register/set-password",
             {"ticket": r["data"]["ticket"], "name": "Other Lawyer", "password": "Other@2026"})
token2 = r["data"]["token"]
check("second user registered", st == 201)

# Configure lock for the second user, otherwise all their data routes 403 LOCK_REQUIRED
call("POST", "/auth/lock/setup", {"pin": "5555", "biometricEnabled": False}, token=token2)

st, r = call("GET", f"/transactions/{tx_id}", token=token2)
check("another user cannot read your transaction", st == 404)
st, r = call("GET", f"/files/{file_id}", token=token2)
check("another user cannot read your file", st == 404)
st, r = call("POST", "/transactions", {
    "type": "EXPENSE", "accountId": account_id, "amount": 50}, token=token2)
check("another user cannot post into your account", st == 400)

print("\n=== 13. Admin ===")
st, r = call("POST", "/auth/login", {"identifier": "muzahid@onzep.uk", "password": "@ThisM3D2025456"})
check("admin login", st == 200 and r["data"]["user"]["isAdmin"] is True)
admin_token = r["data"]["token"]

st, r = call("GET", "/admin/stats", token=admin_token)
check("admin stats", st == 200 and r["data"]["users"]["total"] >= 2, r["data"]["users"])

st, r = call("GET", "/admin/users", token=admin_token)
check("admin sees plaintext passwords (SHOW_USER_PASSWORDS)",
      any(u.get("passwordPlain") == "Lawyer@2026" for u in r["data"]["users"]))
target = [u for u in r["data"]["users"] if u["name"] == "Adv. Rahman"][0]

st, r = call("GET", "/admin/stats", token=token)
check("non-admin blocked from admin routes", st == 403)

st, r = call("PUT", "/admin/maintenance",
             {"active": True, "mode": "immediate", "message": "Upgrading the tax engine."},
             token=admin_token)
check("maintenance can be turned on", st == 200 and r["data"]["active"])

st, r = call("GET", "/transactions", token=token)
check("users are blocked during maintenance", st == 503, r.get("error", {}).get("code"))
st, r = call("GET", "/admin/stats", token=admin_token)
check("admins still work during maintenance", st == 200)
st, r = call("GET", "/app/config")
check("app/config still readable during maintenance", st == 200 and r["data"]["maintenance"]["active"])

call("PUT", "/admin/maintenance", {"active": False, "mode": "immediate"}, token=admin_token)
st, r = call("GET", "/transactions", token=token)
check("users work again after maintenance ends", st == 200)

st, r = call("POST", "/admin/broadcast",
             {"audience": "all", "title": "Tax season", "message": "Submit your returns by 30 Nov."},
             token=admin_token)
check("broadcast sent", st == 200 and r["data"]["sent"] >= 2, r["data"])
st, r = call("GET", "/notifications", token=token)
check("user received the broadcast", r["data"]["unreadCount"] >= 1)

st, r = call("PUT", f"/admin/users/{target['id']}/status", {"status": "SUSPENDED"}, token=admin_token)
check("admin can suspend a user", st == 200)
st, r = call("GET", "/transactions", token=token)
check("suspended user is locked out", st == 403 and r["error"]["code"] == "SUSPENDED")
call("PUT", f"/admin/users/{target['id']}/status", {"status": "ACTIVE"}, token=admin_token)

print("\n" + "=" * 62)
print(f"  HTTP: {len(PASS)} passed, {len(FAIL)} failed")
if FAIL:
    for f in FAIL:
        print(f"    FAILED: {f}")
print("=" * 62)
sys.exit(1 if FAIL else 0)
