// background.js

const DAILY_REMINDER_ALARM_NAME = 'dailyCourseReminder';
const VIDEO_LIST_KEY = 'videoList';
const SETTINGS_KEY = 'settings';

// --- Initialization ---
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed or updated:', details.reason);
  await setupInitialSettings();
  await scheduleDailyReminder();
  // Clean up old alarms if necessary
  chrome.alarms.getAll(alarms => {
    alarms.forEach(alarm => {
      if (alarm.name !== DAILY_REMINDER_ALARM_NAME) {
        chrome.alarms.clear(alarm.name);
      }
    });
  });
});

// --- Settings ---
async function setupInitialSettings() {
  const currentSettings = await chrome.storage.local.get(SETTINGS_KEY);
  const defaults = {
    defaultChunkSizeMinutes: 5,
    dailyGoalMinutes: 30, // Default goal: 30 mins
    enableReminders: true,
    reminderTime: "09:00" // Default reminder time: 9 AM
  };

  const settingsToSave = {
    ...defaults,
    ...(currentSettings[SETTINGS_KEY] || {}) // Merge existing settings over defaults
  };
  await chrome.storage.local.set({ [SETTINGS_KEY]: settingsToSave });
  console.log('Initial settings configured:', settingsToSave);

  // Ensure videoList exists
  const result = await chrome.storage.local.get(VIDEO_LIST_KEY);
  if (!result[VIDEO_LIST_KEY]) {
      await chrome.storage.local.set({ [VIDEO_LIST_KEY]: [] });
      console.log('Initialized empty video list.');
  }
}

// --- Reminders ---
async function scheduleDailyReminder() {
  const { [SETTINGS_KEY]: settings } = await chrome.storage.local.get(SETTINGS_KEY);

  // Clear existing alarm first
  await chrome.alarms.clear(DAILY_REMINDER_ALARM_NAME);
  console.log('Cleared existing daily reminder alarm.');

  if (settings?.enableReminders && settings?.reminderTime) {
    const [hours, minutes] = settings.reminderTime.split(':').map(Number);

    // Calculate time until the next reminder
    const now = new Date();
    let nextReminder = new Date();
    nextReminder.setHours(hours, minutes, 0, 0);

    if (nextReminder <= now) {
      // If the time has already passed today, schedule for tomorrow
      nextReminder.setDate(nextReminder.getDate() + 1);
    }

    const delayInMinutes = Math.max(1, Math.round((nextReminder.getTime() - now.getTime()) / 60000)); // Ensure minimum 1 min delay
    const periodInMinutes = 24 * 60; // Daily

    chrome.alarms.create(DAILY_REMINDER_ALARM_NAME, {
      delayInMinutes: delayInMinutes,
      periodInMinutes: periodInMinutes
    });
    console.log(`Scheduled daily reminder starting in ${delayInMinutes} minutes, repeating every day.`);
  } else {
     console.log('Reminders disabled or time not set, not scheduling alarm.');
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === DAILY_REMINDER_ALARM_NAME) {
    console.log('Daily reminder alarm triggered.');
    await showReminderNotification();
  }
});

async function showReminderNotification() {
    const { [VIDEO_LIST_KEY]: videoList, [SETTINGS_KEY]: settings } = await chrome.storage.local.get([VIDEO_LIST_KEY, SETTINGS_KEY]);

    if (!settings?.enableReminders) return; // Double check if reminders are enabled

    if (videoList && videoList.length > 0) {
        const incompleteVideos = videoList.filter(v => v.completedChunks < v.totalChunks);

        if (incompleteVideos.length > 0) {
            const randomIndex = Math.floor(Math.random() * incompleteVideos.length);
            const video = incompleteVideos[randomIndex];
            const progress = Math.round((video.completedChunks / video.totalChunks) * 100);

            chrome.notifications.create(`reminder-${video.videoId}`, {
                type: 'basic',
                iconUrl: 'images/icon128.png',
                title: 'Keep Learning!',
                message: `Continue watching "${video.title}"? You're ${progress}% complete.`,
                priority: 1, // Medium priority
                buttons: [
                    { title: 'Watch Now' }
                ]
            });
             console.log(`Showing reminder notification for: ${video.title}`);
        } else {
            console.log('All videos in the list are completed, no reminder shown.');
        }
    } else {
        console.log('Video list empty, no reminder shown.');
    }
}

// --- Notification Click Handling ---
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    if (notificationId.startsWith('reminder-') && buttonIndex === 0) {
        const videoId = notificationId.replace('reminder-', '');
        chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${videoId}` });
        chrome.notifications.clear(notificationId); // Clear notification after click
    }
});

// --- Listen for Settings Changes from Popup/Content Script ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'rescheduleReminders') {
    console.log('Received request to reschedule reminders.');
    scheduleDailyReminder()
      .then(() => sendResponse({ success: true }))
      .catch(error => {
          console.error("Error rescheduling reminders:", error);
          sendResponse({ success: false, error: error.message });
      });
    return true; // Indicates asynchronous response
  }
});

// Keep the service worker alive briefly when a relevant tab is active (optional but can help responsiveness)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab?.url?.includes("youtube.com/watch")) {
           // console.log('YouTube watch tab activated, background check.');
           // No specific action needed here now, but keeps the listener active
        }
    } catch (error) {
       // console.warn("Error getting tab info:", error); // Tab might have closed quickly
    }
});

console.log("Background script loaded and running.");