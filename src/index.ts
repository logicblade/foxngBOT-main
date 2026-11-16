import dotenv from "dotenv";
import { db, WHICH_INBOUND, WHICH_PANEL } from "./lib/config";
import { TelBot } from "./lib/bot/bot";
import { ADMIN_ID, formatBytes, getDiskSpace, ownerIds } from "./lib/bot/helpers";
import { CronJob } from "cron";
import { informUserExpiry } from "./lib/bot/remider";

// Load .env before anything reads process.env (bun also auto-loads it).
dotenv.config({ quiet: true });

// Re-exported for backwards compatibility.
export { db, WHICH_INBOUND, WHICH_PANEL };

export const bot = new TelBot(process.env.BOT_TOKEN!, db);

const remider = new CronJob(
  "00 00 22 * * *",
  async function () {
    await informUserExpiry(db);
    console.log("cron job done");
  },
  null,
  true,
  "Asia/Tehran",
);

remider.start();

const HIGH_DISK_THRESHOLD_PERCENT = 90;
const diskAlertSentTo = new Set<number>();

async function checkDiskSpaceAlert() {
  try {
    const disk = await getDiskSpace();
    if (disk.usedPercent < HIGH_DISK_THRESHOLD_PERCENT) {
      diskAlertSentTo.clear();
      return;
    }

    const recipients = new Set([
      ...ownerIds(),
      ...db.getAdmins().map((admin) => admin.tg_id),
    ]);
    const message =
      `⚠️ هشدار فضای دیسک سرور\n\n` +
      `فضای مصرف‌شده به ${disk.usedPercent.toFixed(1)}٪ رسیده است ` +
      `(حد هشدار: ${HIGH_DISK_THRESHOLD_PERCENT}٪).\n` +
      `📦 فضای باقی‌مانده: ${formatBytes(disk.freeBytes)}`;

    for (const recipient of recipients) {
      if (diskAlertSentTo.has(recipient)) continue;
      try {
        await bot.bot.api.sendMessage(recipient, message);
        diskAlertSentTo.add(recipient);
      } catch (error) {
        console.error(`Could not send disk alert to ${recipient}:`, error);
      }
    }
  } catch (error) {
    console.error("Disk space alert check failed:", error);
  }
}

const diskSpaceReminder = new CronJob(
  "00 00 09 * * *",
  async function () {
    await checkDiskSpaceAlert();
  },
  null,
  true,
  "Asia/Tehran",
);

diskSpaceReminder.start();

bot.bot.start();

bot.bot.catch(async (error) => {
  console.log(error);
  await bot.bot.api.sendMessage(
    ADMIN_ID,
    `
مشکلی پیش اومده:
${error.message}`,
  );
});

console.log("Running...");
