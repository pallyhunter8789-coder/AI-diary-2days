import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<{ t?: string }>;
}

export default async function Screen1Redirect({ searchParams }: PageProps) {
  const { t } = await searchParams;
  if (t) {
    redirect(`/screen?t=${encodeURIComponent(t)}`);
  } else {
    redirect("/screen");
  }
}
