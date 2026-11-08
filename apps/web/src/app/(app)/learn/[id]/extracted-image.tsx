"use client";

import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";

export function ExtractedImage({ path }: { path: string }) {
  const { t } = useI18n();
  const {
    data: url,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["document-image", path],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  if (isPending) {
    return (
      <div className="rounded-md border border-border p-md text-sm text-muted-foreground">
        {t("lesson.loadingImage")}
      </div>
    );
  }
  if (isError || !url) {
    return (
      <div role="alert" className="rounded-md border border-border p-md text-sm text-danger">
        {t("lesson.imageFailed")}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage URL, not worth next/image config for lecture figures
  return <img src={url} alt="" className="max-w-full rounded-md border border-border" />;
}
