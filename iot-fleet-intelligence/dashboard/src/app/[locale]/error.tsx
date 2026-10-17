"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button, Card, EmptyState } from "@/components/ui/primitives";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("error");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Card>
      <EmptyState
        icon={<TriangleAlert className="size-5" />}
        title={t("title")}
        body={t("body")}
        action={<Button onClick={reset}>{t("retry")}</Button>}
      />
    </Card>
  );
}
