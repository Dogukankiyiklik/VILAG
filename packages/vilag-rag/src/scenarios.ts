/**
 * VILAG RAG - Scenario Loader
 * Imports all Teams scenario JSON files.
 * When adding a new scenario, import it here and add to the array.
 */
import type { Scenario } from './types';

import sendMessage from '../scenarios/teams/send-message.json';
import createMeeting from '../scenarios/teams/create-meeting.json';
import joinMeeting from '../scenarios/teams/join-meeting.json';
import shareFile from '../scenarios/teams/share-file.json';
import channelMessage from '../scenarios/teams/channel-message.json';
import searchPerson from '../scenarios/teams/search-person.json';
import changeStatus from '../scenarios/teams/change-status.json';
import createGroupChat from '../scenarios/teams/create-group-chat.json';
import shareScreen from '../scenarios/teams/share-screen.json';
import addReaction from '../scenarios/teams/add-reaction.json';
import viewCalendar from '../scenarios/teams/view-calendar.json';
import startCall from '../scenarios/teams/start-call.json';
import downloadFile from '../scenarios/teams/download-file.json';

export const allScenarios: Scenario[] = [
  sendMessage,
  createMeeting,
  joinMeeting,
  shareFile,
  channelMessage,
  searchPerson,
  changeStatus,
  createGroupChat,
  shareScreen,
  addReaction,
  viewCalendar,
  startCall,
  downloadFile,
];
