export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/addProducts/:path*"],
};
