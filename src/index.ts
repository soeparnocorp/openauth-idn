import { issuer } from "@openauthjs/openauth";
import { CloudflareStorage } from "@openauthjs/openauth/storage/cloudflare";
import { PasswordProvider } from "@openauthjs/openauth/provider/password";
import { PasswordUI } from "@openauthjs/openauth/ui/password";
import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string } from "valibot";

const subjects = createSubjects({
user: object({
id: string(),
}),
});

export default {
fetch(request: Request, env: Env, ctx: ExecutionContext) {
const url = new URL(request.url);

// Optional demo OAuth redirect (can be removed in production)
if (url.pathname === "/") {
  url.searchParams.set("redirect_uri", "https://idn.soeparnocorp.workers.dev/callback");
  url.searchParams.set("client_id", "your-client-id");
  url.searchParams.set("response_type", "code");
  url.pathname = "/authorize";
  return Response.redirect(url.toString());
} else if (url.pathname === "/callback") {
  return Response.json({
    message: "OAuth flow complete!",
    params: Object.fromEntries(url.searchParams.entries()),
  });
}

// OpenAuth Server Logic
return issuer({
  storage: CloudflareStorage({
    namespace: env.AUTH_STORAGE,
  }),
  subjects,
  providers: {
    password: PasswordProvider(
      PasswordUI({
        sendCode: async (email, code) => {
          console.log(`Sending code ${code} to ${email}`);
          // Implement actual email sending here if needed
        },
        copy: {
          input_code: "Code (check Worker logs)",
        },
      }),
    ),
  },
  theme: {
    title: "IDN Chat",
    primary: "#0000cc",
    favicon: "https://workers.cloudflare.com/favicon.ico",
    logo: {
      dark: "https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/db1e5c92-d3a6-4ea9-3e72-155844211f00/public",
      light:
        "https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/fa5a3023-7da9-466b-98a7-4ce01ee6c700/public",
    },
  },
  success: async (ctx, value) => {
    const userId = await getOrCreateUser(env, value.email);

    // Redirect to Worker B with token as query param
    const redirectUrl = new URL("https://idn.soeparnocorp.workers.dev/");
    redirectUrl.searchParams.set("token", ctx.subject("user", { id: userId }).token);
    return Response.redirect(redirectUrl.toString());
  },
}).fetch(request, env, ctx);

},
} satisfies ExportedHandler<Env>;

// Function to create or fetch user in D1 database
async function getOrCreateUser(env: Env, email: string): Promise<string> {
const result = await env.AUTH_DB.prepare("INSERT INTO user (email) VALUES (?) ON CONFLICT (email) DO UPDATE SET email = email RETURNING id;")
.bind(email)
.first<{ id: string }>();

if (!result) {
throw new Error("Unable to process user: ${email}");
}

console.log("Found or created user ${result.id} with email ${email}");
return result.id;
}
