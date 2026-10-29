import { OWNER_COOKIE, OWNER_COOKIE_MAX_AGE, ownerToken } from "@/lib/owner";
import { allowRequest } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Sign-in form target: sets the owner cookie for a correct key, or clears it on sign-out. */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => undefined);
  const redirect = (path: string) => new Response(null, { status: 303, headers: { Location: path } });

  if (form?.get("action") === "signout") {
    const response = redirect("/");
    response.headers.append("Set-Cookie", `${OWNER_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
    return response;
  }

  if (!(await allowRequest("owner", request))) return redirect("/owner?error=1");
  const key = form?.get("key");
  const value = typeof key === "string" && key ? ownerToken(key) : undefined;
  if (!value) return redirect("/owner?error=1");

  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const response = redirect("/review");
  response.headers.append(
    "Set-Cookie",
    `${OWNER_COOKIE}=${value}; Path=/; Max-Age=${OWNER_COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax${secure}`,
  );
  return response;
}
