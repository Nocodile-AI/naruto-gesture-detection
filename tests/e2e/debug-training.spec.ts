import { expect, test } from "@playwright/test";
import { STORAGE_NAME, STORAGE_VERSION } from "../../src/storage";
import { seedDataset } from "./seed";

test("debug training reuses training and persistence with one frame per class", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("/");
  await seedDataset(page);
  await page.evaluate(
    async ({ name, version }) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(name, version);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("state", "readwrite");
          const store = tx.objectStore("state");
          const get = store.get("dataset");
          get.onsuccess = () => {
            const saved = get.result;
            saved.dataset.clips = [
              saved.dataset.clips[0],
              saved.dataset.clips.find((clip: { label: string }) => clip.label === "not_sign"),
            ];
            for (const clip of saved.dataset.clips) clip.frames = clip.frames.slice(0, 1);
            store.put(saved, "dataset");
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    },
    { name: STORAGE_NAME, version: STORAGE_VERSION },
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "Train model", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Debug train", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Debug train", exact: true }).click();
  await expect(page.locator("#trained-controls")).toBeVisible({ timeout: 45000 });
  await page.reload();
  await expect(page.locator("#trained-controls")).toBeVisible();
});
