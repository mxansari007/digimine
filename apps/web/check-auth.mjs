import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const PROJECT_ID = "digimine-1c33f";
const CLIENT_EMAIL = "firebase-adminsdk-fbsvc@digimine-1c33f.iam.gserviceaccount.com";
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCnFoaCkKZEmzwV
GFGpi3EPlsUyxQI7Y0pM/0A7kApSTS3YK7hdi+jm30Yb1P203frWYpVfZuxATsrg
8ZeGuEfnHsyP+6xouxFxpUSGwIrI2euPhUP/Zd2OBn7DdSgHwwBbI75ujw06N+Ge
UVKIhKnrE3QGXyO1+tiBL67x3/GpRAo17JeYtOeqi6LZvxY7ABgfsqa2U1Lhq9yh
k2E71aT0S+G7f+2k+l7Sdg9uVdBuqoNWovJ6Mph3jKA8JWgZ9X9Xbli11aTNOcpn
cj8TzFsWbLYyEq47ycriJCStaw/+EjSh5O1Fp2PlREpfuQMrEzAAs41AWhECVl7c
l4F95oqfAgMBAAECggEAT0F1i1AutgNGZCE1dy0f84uKPZNKhD4MO+qlnrsr0i8u
zEesu57GWmDVIhWNRHI47eE0Rl0NOlHFlR6zx+D4pk4rLS7tcH4vf48rqpmBG1WX
EWxevTIl/hzhmzgixU+/hvu09D9hwFhKamzbr8rxyIJhOjZ9u2/hq6GhI7UcrbNG
UcSl++xk+Rqx66il31zkGSw6bgb014qYBYZcik5qJj8o8GHel8y/SGWtA9jw8c8v
EYK21JxXJpdrX9/mk59nKnLRUgBryrbzv04wVHPCeeeytZVQb6MR6tkUbGiEjkQe
e0iNcVF9/j/VsXr8LLdtsZBjenPartkJTHVEfmijyQKBgQDdnChcDmWrva9TcRk6
20YnQ6q9P94Z9nFkaGNaG4P83xo6zN6G1BLX9qsqJr5MYs50O5qQqT9BRQh+5qwf
sauZ90vqBWezD6SHsj2geDyh2MLxcKO+veOmSpVbcKLhmVoU2UNhOwmCtY1ayy2S
diFgJNsMYMGJIrxNkT/EkQnLlwKBgQDBBGLu1o0KDKizYTtLbspN5iMEU9z9V5ce
MTzTGpRZScSwIWF6Gva+mtOI8psrdqv2hsDqSyqCaVhCEOCZwvgvYq3lPST+2Hf1
4GDmBF1QJ9v9Qy9m06rYg0qOYJOEpTgXWxzDPPqaqLwWXni9wKulSI9+slELg4T3
0r9hjSg6OQKBgAosvkmju5VMCz24hqEGKk1pNPClewwUHZavmEgt1TyJ/clPWLQ2
Dntt7uPrjXcyXipGBk24B5h2k/JHowV9gdR63zhqcR1ujW5Rh7TTcG0555FwS4RZ
cZdT+1GMdV4ITXOBmi9fp4shzNCrXXdJBzVD2+7QjnI+bwjcr2HWCu4XAoGAL3ha
tI7DxTLz0poZMSYgTyRIfGn7sbr3CY/me6zPy13fJ8ot5Q/4m0wMtmOkUf4vsMPX
ckfmPoiWEjmAY5CV5WGJjxWIobyvVCNI8YklQe9rpU/+unVYUUOI9Jc/8KGJuATK
gCHhKGRTTdUSMOjPziiYUfqdAA3qh+Cm/ODwgdECgYEAtj55DDnGZTTrs39zaglR
7r8OOep8TY/UXVy65WmjhQ8ura9f6URw2xBqA0pVe24HMo9pwyuz3wJ27X4LWTfk
JVu/bBqX/OZyO/xfYoPaUqgpfqZ46RCeLsishjgcv0GKXw9EeFE4OvhaZ0TzBYll
BLUlB3rEmDme4Hgf1LOdKsw=
-----END PRIVATE KEY-----
`;

initializeApp({ credential: cert({ projectId: PROJECT_ID, clientEmail: CLIENT_EMAIL, privateKey: PRIVATE_KEY }) });

const auth = getAuth();
async function check() {
    try {
        const user = await auth.getUserByEmail("admin@digimine.shop");
        console.log("✅ User found in Auth:", user.uid);
    } catch(err) {
        console.log("❌ User NOT found in Auth:", err.message);
    }
}
check();
