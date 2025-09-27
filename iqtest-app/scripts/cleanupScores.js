#!/usr/bin/env node
/*
 * Maintenance script to deduplicate the scores collection.
 *
 * Usage:
 *   node -r dotenv/config scripts/cleanupScores.js --dry
 *   node -r dotenv/config scripts/cleanupScores.js
 */

const { argv, exit } = require('node:process');
const { setTimeout: sleep } = require('node:timers/promises');

const { admin, db } = require('../src/server/firebaseAdmin.js');

const DRY_RUN = argv.includes('--dry');
const BATCH_SIZE = 450;

const normalizeNickname = (nickname) => {
  if (typeof nickname !== 'string') return '';
  return nickname.trim().toLowerCase();
};

const timestampToMillis = (timestamp) => {
  if (!timestamp) return null;
  if (typeof timestamp.toMillis === 'function') {
    try {
      const value = timestamp.toMillis();
      return Number.isFinite(value) ? value : null;
    } catch (error) {
      return null;
    }
  }
  if (typeof timestamp.seconds === 'number') {
    return Math.round(timestamp.seconds * 1000);
  }
  if (timestamp instanceof Date) {
    const value = timestamp.getTime();
    return Number.isFinite(value) ? value : null;
  }
  return null;
};

const newestDoc = (docs) => {
  if (docs.length <= 1) return docs[0];

  return docs
    .slice()
    .sort((a, b) => {
      const aData = a.data();
      const bData = b.data();

      const aTime = Math.max(
        timestampToMillis(aData?.updatedAt) ?? 0,
        timestampToMillis(aData?.createdAt) ?? 0,
        timestampToMillis(a.updateTime) ?? 0,
        timestampToMillis(a.createTime) ?? 0
      );

      const bTime = Math.max(
        timestampToMillis(bData?.updatedAt) ?? 0,
        timestampToMillis(bData?.createdAt) ?? 0,
        timestampToMillis(b.updateTime) ?? 0,
        timestampToMillis(b.createTime) ?? 0
      );

      if (aTime === bTime) {
        return b.id.localeCompare(a.id);
      }
      return bTime - aTime;
    })[0];
};

async function cleanup() {
  console.log(`[cleanupScores] Starting${DRY_RUN ? ' (dry-run)' : ''}...`);

  const snapshot = await db.collection('scores').get();
  const totalDocs = snapshot.size;
  console.log(`[cleanupScores] Total docs: ${totalDocs}`);

  if (totalDocs === 0) {
    console.log('[cleanupScores] Nothing to process.');
    return { totalDocs, uniqueNicknames: 0, deleted: 0 };
  }

  const groups = new Map();

  snapshot.docs.forEach((doc) => {
    const nickname = normalizeNickname(doc.data()?.nickname);
    if (!nickname) return;

    if (!groups.has(nickname)) {
      groups.set(nickname, []);
    }
    groups.get(nickname).push(doc);
  });

  const uniqueNicknames = groups.size;
  const deleteTargets = [];

  groups.forEach((docs, nickname) => {
    if (docs.length <= 1) return;
    const keep = newestDoc(docs);
    docs.forEach((doc) => {
      if (doc.id !== keep.id) {
        deleteTargets.push({ nickname, doc });
      }
    });
  });

  const deleteCount = deleteTargets.length;
  console.log(`[cleanupScores] Unique nicknames: ${uniqueNicknames}`);
  console.log(`[cleanupScores] Duplicate docs: ${deleteCount}`);

  if (deleteCount === 0) {
    console.log('[cleanupScores] Nothing to delete.');
    return { totalDocs, uniqueNicknames, deleted: 0 };
  }

  if (DRY_RUN) {
    deleteTargets.forEach(({ nickname, doc }) => {
      console.log(`[cleanupScores] [dry-run] would delete doc=${doc.id} nickname=${nickname}`);
    });
    console.log('[cleanupScores] Dry-run complete.');
    return { totalDocs, uniqueNicknames, deleted: 0 };
  }

  for (let index = 0; index < deleteTargets.length; index += BATCH_SIZE) {
    const slice = deleteTargets.slice(index, index + BATCH_SIZE);
    const batch = db.batch();

    slice.forEach(({ doc }) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`[cleanupScores] Deleted batch ${Math.floor(index / BATCH_SIZE) + 1}: ${slice.length} docs`);

    await sleep(100);
  }

  console.log('[cleanupScores] Cleanup complete.');
  return { totalDocs, uniqueNicknames, deleted: deleteCount };
}

cleanup()
  .then(({ totalDocs, uniqueNicknames, deleted }) => {
    console.log('[cleanupScores] Summary:', { totalDocs, uniqueNicknames, deleted });
    return admin.apps.length ? admin.app().delete().catch(() => {}) : null;
  })
  .catch((error) => {
    console.error('[cleanupScores] Failed:', error);
    if (admin.apps.length) {
      admin.app().delete().catch(() => {});
    }
    exit(1);
  });
