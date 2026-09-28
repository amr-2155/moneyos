import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.moneyos.app",
  appName: "MoneyOS",
  webDir: "dist",
  server: {
    androidScheme: "https",
    url: "https://moneyos-free.fly.dev",
  },
};

export default config;
