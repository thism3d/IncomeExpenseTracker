// Zod body validation. Replaces req.body with the parsed (coerced, stripped) value
// so controllers can trust their inputs.
const validate = (schema) => (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
        const first = result.error.issues[0];
        return res.status(400).json({
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: `${first.path.join('.') || 'body'}: ${first.message}`,
                issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
            },
        });
    }
    req.body = result.data;
    return next();
};

const validateQuery = (schema) => (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
        const first = result.error.issues[0];
        return res.status(400).json({
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: `${first.path.join('.') || 'query'}: ${first.message}`,
            },
        });
    }
    // Express 5's req.query is a getter — assign to a separate field the
    // controllers read from.
    req.validQuery = result.data;
    return next();
};

module.exports = { validate, validateQuery };
