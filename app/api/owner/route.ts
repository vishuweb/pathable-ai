import { OWNER_COOKIE, crossSiteRefusal, signIn } from "@/lib/owner";
import { allowRequest } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Sign-in form target: starts a signed, expiring session for a correct key, or ends it on sign-out. */
export async function POST(request: Request) {
  const refused = crossSiteRefusal(request);
  if (refused) return refused;
  const form = await request.formData().catch(() => undefined);
  const redirect = (path: string) => new Response(null, { status: 303, headers: { Location: path } });

  if (form?.get("action") === "signout") {
    const response = redirect("/");
    response.headers.append("Set-Cookie", `${OWNER_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
    return response;
  }

  if (!(await allowRequest("owner", request))) return redirect("/owner?error=1");
  const key = form?.get("key");
  // Without the keys configured, signIn finds nothing to match, so sign-in is impossible rather than open.
  const session = typeof key === "string" && key ? signIn(key) : undefined;
  if (!session) return redirect("/owner?error=1");

  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const response = redirect(session.role === "owner" ? "/owner" : "/review");
  response.headers.append(
    "Set-Cookie",
    `${OWNER_COOKIE}=${session.value}; Path=/; Max-Age=${session.maxAge}; HttpOnly; SameSite=Lax${secure}`,
  );
  return response;
}
