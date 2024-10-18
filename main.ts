import { Application, Router } from "@oak/oak";
import { bold, brightBlue } from "@std/fmt/colors";
import config from './config/config.json' with { type: 'json' }
import { randomBytes } from "https://deno.land/std@0.158.0/node/crypto.ts";

// callback URL (/tvii/getAccessTokenTW)
const callbackUrl = `${config.api['website_url']}/tvii/getAccessTokenTW`;

const consumerKey = config.api['twttr_consumer_key'];
const consumerSecret = config.api['twttr_consumer_secret'];

const oauthAssociations: Record<string, {
  oauthToken?: string;
  oauthVerifier?: string;
  oauthUrl?: string;
  accessToken?: string;
  accessTokenSecret?: string;
  userId?: string;
  screenName?: string;
  status: "unverified" | "verified";
}> = {};

function generateSixDigitCode(): string {
  let code;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (oauthAssociations[code]);
  return code;
}

function generateNonce(): string {
  return randomBytes(16).toString("hex");
}

async function generateHmacSha1Signature(baseString: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const messageData = encoder.encode(baseString);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);

  const signatureBytes = new Uint8Array(signature);
  const base64Signature = btoa(String.fromCharCode(...signatureBytes));

  return encodeURIComponent(base64Signature);
}

const router = new Router();
const port = config.http.port

// root/index path and page
router.get("/", async (ctx) => {
  await ctx.send({ path: "/index.html", root: "./views" });
});

router.get("/tvii/linkSocials", async (ctx) => {
  await ctx.send({ path: "/tviiLinkSocials.html", root: "./views" });
});

router.get("/tvii/twitterAuth", async (ctx) => {
  await ctx.send({ path: "/authenticateTwitter.html", root: "./views" });
});

router.get("/tvii/tumblrAuth", async (ctx) => {
  await ctx.send({ path: "/authenticateTumblr.html", root: "./views" });
});

//Generate the code for TVii client and store it here
router.get("/tvii/generateTWCode", async (ctx) => {
  try {
    const generatedCode = generateSixDigitCode();

    const oauthNonce = generateNonce();
    const oauthTimestamp = Math.floor(Date.now() / 1000).toString();

    const params = {
      oauth_callback: `${callbackUrl}?code=${generatedCode}`,
      oauth_consumer_key: consumerKey,
      oauth_nonce: oauthNonce,
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: oauthTimestamp,
      oauth_version: "1.0",
    };

    const baseString = `POST&${encodeURIComponent("https://api.twitter.com/oauth/request_token")}&${encodeURIComponent(
      Object.keys(params)
        .sort()
        .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
        .join("&")
    )}`;

    const signingKey = `${encodeURIComponent(consumerSecret)}&`; // Signing key (consumer secret + empty token secret)
    const oauthSignature = await generateHmacSha1Signature(baseString, signingKey);

    const authorizationHeader = `OAuth oauth_nonce="${oauthNonce}", oauth_callback="${encodeURIComponent(params.oauth_callback)}", oauth_signature_method="HMAC-SHA1", oauth_timestamp="${oauthTimestamp}", oauth_consumer_key="${consumerKey}", oauth_signature="${oauthSignature}", oauth_version="1.0"`;

    const response = await fetch("https://api.twitter.com/oauth/request_token", {
      method: "POST",
      headers: {
        "Authorization": authorizationHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const responseBody = await response.text();
    console.log(responseBody);
    const responseParams = new URLSearchParams(responseBody);
    const oauthToken = responseParams.get("oauth_token");

    if (!oauthToken) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Failed to obtain request token from Twitter." };
      return;
    }

    const authorizationUrl = `https://api.twitter.com/oauth/authorize?oauth_token=${oauthToken}`;

    // Update the oauthAssociations object with the new entry
    oauthAssociations[generatedCode] = {
      oauthToken,
      oauthUrl: authorizationUrl,
      status: "unverified",
    };

    ctx.response.status = 200;
    ctx.response.body = {
      code: generatedCode,
    };
  } catch (error) {
    console.error("Error in /twttrLinkAttempt:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error." };
  }
});

//Check the code submitted for twitter oauth redirection
router.get("/tvii/checkForTWRedirect", async (ctx) => {
  try {
    const code = ctx.request.url.searchParams.get('code');

    if (!code || !oauthAssociations[code]) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Invalid or expired code." };
      return;
    }

    const authLink = oauthAssociations[code].oauthUrl;
    // Redirect to the associated OAuth URL
    ctx.response.redirect(authLink);
  } catch (error) {
    console.error("Error in /twttrCodeCheck:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error." };
  }
});

//Actually forward the authentication data to the code stored
router.get("/tvii/getAccessTokenTW", async (ctx) => {
  try {
    const query = ctx.request.url.searchParams;
    const code = query.get('code');
    const oauthToken = query.get('oauth_token');
    const oauthVerifier = query.get('oauth_verifier');

    if (!code || !oauthAssociations[code] || oauthAssociations[code].oauthToken !== oauthToken) {
      // Invalid code or token mismatch
      ctx.response.status = 400;
      ctx.response.body = { error: "Invalid or expired code." };
      return;
    }

    // Request access token from Twitter
    const response = await fetch("https://api.twitter.com/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        oauth_token: oauthToken!,
        oauth_verifier: oauthVerifier!,
      }),
    });

    const responseBody = await response.text();
    const responseParams = new URLSearchParams(responseBody);

    if (responseParams.has('oauth_token')) {
      // Mark the code as verified and store additional data
      const oauthG = oauthAssociations[code];
      oauthG.accessToken = responseParams.get('oauth_token') || "";
      oauthG.accessTokenSecret = responseParams.get('oauth_token_secret') || "";
      oauthG.userId = responseParams.get('user_id') || "";
      oauthG.screenName = responseParams.get('screen_name') || "";
      oauthG.status = "verified";

      ctx.response.status = 200;
      ctx.response.body = { message: "Verification successful." };
    } else {
      ctx.response.status = 400;
      ctx.response.body = { error: "Failed to verify with Twitter." };
    }
  } catch (error) {
    console.error("Error in /twttrCodeFinalVerification:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error." };
  }
});

router.get('/tvii/clientCheckTWCodeVerified', (ctx) => {
  try {
    const code = ctx.request.url.searchParams.get('code');

    if (!code || !oauthAssociations[code]) {
      // If the code is invalid or not verified
      ctx.response.status = 400;
      ctx.response.body = { error: "Code is not verified or does not exist." };
      return;
    }

    if (oauthAssociations[code] && oauthAssociations[code].status != "verified") {
      // If the code is invalid or not verified
      ctx.response.status = 200;
      ctx.response.body = {
        code: code,
        status: "unverified"
      };
      return;
    }

    // Respond with the twitter auth data
    const { screenName, accessToken, accessTokenSecret } = oauthAssociations[code];

    ctx.response.status = 200;
    ctx.response.body = {
      code: code,
      twttr_screen_name: screenName!,
      twttr_oauth_token: accessToken!,
      twttr_oauth_verifier: accessTokenSecret!,
      status: "verified"
    };

    //Remove, since its supposed to be only given once
    if (oauthAssociations[code]) {
      delete oauthAssociations[code];
    }
  } catch (error) {
    console.error("Error in /twttrCodeValidYet:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error." };
  }
});

const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());

// static public folder
app.use(async (ctx, next) => {
  try {
    await ctx.send({ root: "./public/" });
  } catch {
    await next();
  }
});

// 404 Not Found page
app.use(async (ctx) => {
  await ctx.send({ path: "/errors/404.html", root: "./views" });
});

app.listen({ port });
app.addEventListener("listen", ({ port }) => {
  console.log(bold(brightBlue(`The Project Rosé website is running on port ${port}`)));
});