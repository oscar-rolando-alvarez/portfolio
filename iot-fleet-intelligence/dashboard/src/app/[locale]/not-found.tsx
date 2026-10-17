import { Compass } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/ui/primitives";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("notFound");
  return (
    <EmptyState
      icon={<Compass className="size-5" />}
      title={t("title")}
      body={t("body")}
      action={
        <Link href="/" className="mt-2 text-sm font-medium text-accent hover:underline">
          {t("back")}
        </Link>
      }
    />
  );
}
