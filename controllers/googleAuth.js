const {
    google
} = require('googleapis');
const credentials = require("../credentials.json");
const db = require("../models");
var Oauth2 = db.oauth2;
var User = db.users;
var Provider = db.providers;
const {
    Op
} = require("sequelize");
const {
    v4: uuidv4
} = require('uuid');


module.exports = (app) => {
    const oauth2ClientToken = new google.auth.OAuth2(
        credentials.google.GOOGLE_CLIENT_ID,
        credentials.google.GOOGLE_CLIENT_SECRET,
        "http://localhost:3000/oauth2/google/Tokens/redirect/"
    );

    // generate a url that asks permissions for Blogger and Google Calendar scopes
    const token_scopes = [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/userinfo.profile'
    ];

    const token_url = oauth2ClientToken.generateAuthUrl({
        // 'online' (default) or 'offline' (gets refresh_token)
        access_type: 'offline',

        // If you only need one scope you can pass it as a string
        scope: token_scopes
    });

    app.post('/oauth2/google/Tokens/', async (req, res, next) => {
        if (req.body.auth_key) {
            return res.status(200).json({
                auth_key: req.body.auth_key,
                provider: req.body.provider,
                url: token_url
            });
        }
    });

    // app.post('/oauth2/google/code', async (req, res, next) => {
    //     let data = JSON.parse(req.body.data);
    //     let token = data.id_token;

    //     const {
    //         OAuth2Client
    //     } = require('google-auth-library');
    //     const client = new OAuth2Client(credentials.google.GOOGLE_CLIENT_ID);
    //     const ticket = await client.verifyIdToken({
    //         idToken: token,
    //         audience: credentials.google.GOOGLE_CLIENT_ID, // Specify the CLIENT_ID of the app that accesses the backend
    //         // Or, if multiple clients access the backend:
    //         //[CLIENT_ID_1, CLIENT_ID_2, CLIENT_ID_3]
    //     });
    //     const payload = ticket.getPayload();
    //     const userid = payload['sub'];
    //     // If request specified a G Suite domain:
    //     // const domain = payload['hd'];

    //     console.log(data)
    //     console.log(payload);
    //     console.log(userid)
    //     return res.status(200).json("well done it works");
    // });

    // app.get('/oauth2/google/Tokens/redirect', async (req, res, next) => {
    //     let code = req.query.code

    //     return res.status(200).json({
    //         code: code
    //     });
    // });

    app.post('/google/auth/success', async (req, res, next) => {
        let code = req.body.code;
        let auth_key = req.body.auth_key;

        const {
            tokens
        } = await oauth2ClientToken.getToken(code).catch(error => {
            error.httpStatusCode = 500
            return next(error);
        });
        oauth2ClientToken.setCredentials(tokens);

        // get profile data
        var gmail = google.oauth2({
            auth: oauth2ClientToken,
            version: 'v2'
        });

        let profile = await gmail.userinfo.get();

        let oauth2 = await Oauth2.findAll({
            where: {
                profileId: profile.data.id
            }
        });

        if (oauth2[0]) {
            const error = new Error("Token already exist");
            error.httpStatusCode = 400;
            return next(error);
        }

        // SEARCH FOR USER IN DB
        let user = await User.findAll({
            where: {
                auth_key: auth_key
            }
        }).catch(error => {
            error.httpStatusCode = 500
            return next(error);
        })

        // RTURN = [], IF USER IS NOT FOUND
        if (user.length < 1) {
            const error = new Error("Invalid key");
            error.httpStatusCode = 401;
            return next(error);
        }

        // IF MORE THAN ONE USER EXIST IN DATABASE
        if (user.length > 1) {
            const error = new Error("duplicate Users");
            error.httpStatusCode = 409;
            return next(error);
        }

        await Oauth2.create({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiry_date: tokens.expiry_date,
            scope: tokens.scope.split(" "),
            profile: profile,
            profileId: profile.data.id
        });

        await Oauth2.update({
            userId: user[0].id
        }, {
            where: {
                profileId: profile.data.id
            }
        })

        let provider = await Provider.findAll({
            where: {
                name: req.body.provider
            }
        })

        if (provider.length < 1) {
            const error = new Error("Invalid Provider");
            error.httpStatusCode = 401;
            return next(error);
        }

        if (provider.length > 1) {
            const error = new Error("duplicate providers");
            error.httpStatusCode = 401;
            return next(error);
        }

        await Oauth2.update({
            providerId: provider[0].id
        }, {
            where: {
                profileId: profile.data.id
            }
        })

        await user[0].update({
            auth_key: uuidv4()
        }).catch(error => {
            error.httpStatusCode = 500
            return next(error);
        });

        return res.status(200).json({
            auth_key: user[0].auth_key
        });
    });

    // app.get('/users/auth/failure', async (req, res, next) => {
    // });

    app.get('/oauth2/google/Tokens/revoke', async (req, res, next) => {
        let user = await User.findAll({
            where: {
                id: req.query.iden
            }
        });

        if (user.length < 1) {
            const error = new Error("Invalid key");
            error.httpStatusCode = 401;
            return next(error);
        }

        if (user.length > 1) {
            const error = new Error("duplicate users");
            error.httpStatusCode = 401;
            return next(error);
        }

        let provider = await Provider.findAll({
            where: {
                id: req.query.provider
            }
        })

        if (provider.length < 1) {
            const error = new Error("Invalid Provider");
            error.httpStatusCode = 401;
            return next(error);
        }

        if (provider.length > 1) {
            const error = new Error("duplicate providers");
            error.httpStatusCode = 401;
            return next(error);
        };

        let oauth2 = await Oauth2.findAll({
            where: {
                [Op.and]: [{
                    userId: user[0].id
                }, {
                    providerId: provider[0].id
                }]
            }
        }).catch(error => {
            error.httpStatusCode = 500
            return next(error);
        });

        if (oauth2.length < 1) {
            const error = new Error("Token doesn't exist");
            error.httpStatusCode = 401;
            return next(error);
        }

        if (oauth2.length > 1) {
            const error = new Error("duplicate Tokens");
            error.httpStatusCode = 409;
            return next(error);
        };

        await oauth2ClientToken.revokeToken(oauth2[0].accessToken).catch(error => {
            error.httpStatusCode = 500
            return next(error);
        });

        await oauth2[0].destroy().catch(error => {
            error.httpStatusCode = 500
            return next(error);
        });;

        return res.status(200).json({
            message: "Token revoke success"
        });

    });

    // const oauth2ClientProfile = new google.auth.OAuth2(
    //     credentials.google.GOOGLE_CLIENT_ID,
    //     credentials.google.GOOGLE_CLIENT_SECRET,
    //     "http://localhost:9000/oauth2/google/login/redirect/"
    // );

    // // generate a url that asks permissions for Blogger and Google Calendar scopes
    // const profile_scopes = [
    //     'https://www.googleapis.com/auth/userinfo.email',
    //     'https://www.googleapis.com/auth/userinfo.profile'
    // ];

    // const profile_url = oauth2ClientProfile.generateAuthUrl({
    //     // 'online' (default) or 'offline' (gets refresh_token)
    //     // access_type: 'offline',

    //     // If you only need one scope you can pass it as a string
    //     scope: profile_scopes
    // });

    // app.get('/oauth2/google/login/', async (req, res, next) => {
    //     // Opens the URL in the default browser.
    //     // await open(profile_url);
    //     res.redirect(profile_url);
    // });

    // app.get('/oauth2/google/login/redirect', async (req, res, next) => {
    //     let code = req.query.code
    //     const {
    //         tokens
    //     } = await oauth2ClientProfile.getToken(code)
    //     oauth2ClientProfile.setCredentials(tokens);

    //     // get profile data
    //     var google_oauth2 = google.oauth2({
    //         auth: oauth2ClientProfile,
    //         version: 'v2'
    //     });

    //     let profile = await google_oauth2.userinfo.get();

    //     let user = await User.findAll({
    //         where: {
    //             [Op.and]: [{
    //                 profileId: profile.data.id
    //             }, {
    //                 email: profile.data.email
    //             }]
    //         }
    //     });

    //     if (user.length > 1) {
    //         const error = new Error("duplicate users");
    //         error.httpStatusCode = 409;
    //         return next(error);
    //     }

    //     if (user.length < 1) {
    //         let newUser = await User.create({
    //             profileId: profile.data.id,
    //             username: profile.data.name,
    //             email: profile.data.email
    //         }).catch(error => {
    //             error.httpStatusCode = 500
    //             return next(error);
    //         });;

    //         if (newUser.phone_number) {
    //             await user[0].update({
    //                 auth_key: uuidv4()
    //             }).catch(error => {
    //                 error.httpStatusCode = 500
    //                 return next(error);
    //             });

    //             return res.status(200).json({
    //                 auth_key: user[0].auth_key
    //             });
    //         }

    //         await newUser.update({
    //             auth_key: uuidv4()
    //         }).catch(error => {
    //             error.httpStatusCode = 500
    //             return next(error);
    //         });

    //         return res.status(403).json({
    //             error: "No phone_number",
    //             auth_key: newUser.auth_key
    //         });
    //     }

    //     if (user[0].phone_number) {
    //         await user[0].update({
    //             auth_key: uuidv4()
    //         }).catch(error => {
    //             error.httpStatusCode = 500
    //             return next(error);
    //         });

    //         return res.status(200).json({
    //             auth_key: user[0].auth_key
    //         });
    //     }

    //     await user[0].update({
    //         auth_key: uuidv4()
    //     }).catch(error => {
    //         error.httpStatusCode = 500
    //         return next(error);
    //     });

    //     return res.status(403).json({
    //         error: "No phone_number",
    //         auth_key: user[0].auth_key
    //     });
    // });
}