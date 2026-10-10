import { router } from 'expo-router';

export function openFeedingLog(): void {
  router.push('/feeding');
}

export function openSleepLog(): void {
  router.push('/sleep');
}

export function openDiaperLog(): void {
  router.push('/diapers');
}

export function openGrowthLog(): void { router.push('/growth'); }

export function openMilestones(): void { router.push('/milestones'); }
