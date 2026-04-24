/**
 * VILAG RAG - Scenario Loader
 * Imports all Teams scenario JSON files.
 * When adding a new scenario, import it here and add to the array.
 */
import type { Scenario } from './types';

import sendMessage from '../scenarios/teams/send-message.json';
import createMeeting from '../scenarios/teams/create-meeting.json';
import joinMeeting from '../scenarios/teams/join-meeting.json';
import viewCalendar from '../scenarios/teams/view-calendar.json';
import shareMeetingLinkChat from '../scenarios/teams/share-meeting-link-chat.json';

export const allScenarios: Scenario[] = [
  shareMeetingLinkChat,
  sendMessage,
  createMeeting,
  joinMeeting,
  viewCalendar,
];
