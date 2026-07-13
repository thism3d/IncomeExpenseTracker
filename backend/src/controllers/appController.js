const { query } = require('../utils/db');
const { ok } = require('../utils/respond');
const { getMaintenance } = require('../middleware/maintenance');

// GET /api/app/config  — public. The one endpoint every client polls on launch:
// is the app in maintenance, and is there a newer build to install.
const getAppConfig = async (req, res) => {
    const [maintenance, version] = await Promise.all([
        getMaintenance(),
        query(
            `SELECT version_name, version_code, changelog, apk_url, mandatory
               FROM app_versions
              WHERE is_active = true
              ORDER BY version_code DESC LIMIT 1`
        ),
    ]);

    const v = version.rows[0];
    return ok(res, {
        maintenance,
        latestVersion: v
            ? {
                versionName: v.version_name,
                versionCode: v.version_code,
                changelog: v.changelog,
                apkUrl: v.apk_url,
                mandatory: v.mandatory,
            }
            : null,
        minAppVersion: 1,
    });
};

module.exports = { getAppConfig };
