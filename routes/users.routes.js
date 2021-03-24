function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login/fail');
};

function checkTokenExist(req, res, next) {
    if (req.user.token.length > 0) {
        return next();
    }
    // const error = new Error("Please get a tokens here: /oauth2/:platforms/Tokens/");
    // error.httpStatusCode = 403;
    // return next(error)
    // res.redirect("/oauth2/google/Tokens/")
    return next()
}

let checks = [ensureAuthenticated, checkTokenExist];

module.exports = (app) => {
    app.get("/profile", checks, (req, res) => {
        res.status(200).json({
            user: req.user
        });
    })

    app.get("/oauth2_profile", (req, res) => {
        res.status(200).json({
            message: "token stored"
        });
    })
}