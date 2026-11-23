/** Compatibility surface for data persistence, re-exported from focused modules. */
export { collection, doc, getDoc } from 'firebase/firestore';

export {
  getUser,
  saveUser,
  updateUser,
  getLifestyleSettings,
  saveLifestyleSettings,
} from './dataServiceUsers';

export {
  listConversations,
  createConversation,
  updateConversation,
  deleteConversation,
  listMessages,
  addMessage,
} from './dataServiceChat';

export {
  addAirQualityRecord,
  listAirQualityRecords,
  savePredictions,
  getLatestPredictions,
  addCarbonTrip,
  listCarbonTrips,
  deleteCarbonTrip,
} from './dataServiceEnvironment';

export { addUpload, listUploads, deleteUpload, isUploadReady } from './dataServiceUploads';
