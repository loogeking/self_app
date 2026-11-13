import { redirect } from "next/navigation";
import Prototype from "@/components/proto/Prototype";
import { isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!(await isAuthed())) redirect("/login");
  return <Prototype />;
}