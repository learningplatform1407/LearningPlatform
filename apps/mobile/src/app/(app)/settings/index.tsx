import { router } from "expo-router";
import { useEffect } from "react";

export default function SettingsIndexScreen() {
  useEffect(() => {
    router.replace("/settings/account");
  }, []);
  return null;
}
