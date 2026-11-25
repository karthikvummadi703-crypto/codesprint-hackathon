/**
 * Firestore and localStorage persistence facade for users, conversations,
 * messages, uploads, AQI history, carbon trips, and lifestyle settings.
 */
export {
  addAirQualityRecord,
  getLatestPredictions,
  listAirQualityRecords,
  savePredictions,
} from './dataService/airAndPredictions';
export { addCarbonTrip, deleteCarbonTrip, listCarbonTrips } from './dataService/carbon';
export {
  addMessage,
  createConversation,
  deleteConversation,
  listConversations,
  listMessages,
  updateConversation,
} from './dataService/conversations';
export { addUpload, deleteUpload, isUploadReady, listUploads } from './dataService/uploads';
export {
  getLifestyleSettings,
  getUser,
  saveLifestyleSettings,
  saveUser,
  updateUser,
} from './dataService/userData';

// Re-export for convenience
export { collection, doc, getDoc } from 'firebase/firestore';
