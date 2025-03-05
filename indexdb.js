// IndexedDB Storage Utility
class IndexedDBStorage {
  constructor(dbName, version = 1) {
      this.dbName = dbName;
      this.version = version;
      this.db = null;
  }

  async openDatabase() {
      return new Promise((resolve, reject) => {
          const request = indexedDB.open(this.dbName, this.version);

          request.onupgradeneeded = (event) => {
              const db = event.target.result;
              
              // Create object stores for different types of data
              if (!db.objectStoreNames.contains('responses')) {
                  db.createObjectStore('responses', { 
                      keyPath: 'id', 
                      autoIncrement: true 
                  });
              }
          };

          request.onsuccess = (event) => {
              this.db = event.target.result;
              resolve(this.db);
          };

          request.onerror = (event) => {
              reject(`IndexedDB error: ${event.target.error}`);
          };
      });
  }

  async saveResponse(storeName, data) {
      if (!this.db) await this.openDatabase();

      return new Promise((resolve, reject) => {
          const transaction = this.db.transaction([storeName], 'readwrite');
          const store = transaction.objectStore(storeName);
          
          // Add timestamp to the data
          data.timestamp = new Date().toLocaleString();
          
          const request = store.add(data);

          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(`Error saving data: ${request.error}`);
      });
  }

  async getAllResponses(storeName) {
      if (!this.db) await this.openDatabase();

      return new Promise((resolve, reject) => {
          const transaction = this.db.transaction([storeName], 'readonly');
          const store = transaction.objectStore(storeName);
          
          const request = store.getAll();

          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(`Error fetching data: ${request.error}`);
      });
  }

  async deleteResponse(storeName, id) {
      if (!this.db) await this.openDatabase();

      return new Promise((resolve, reject) => {
          const transaction = this.db.transaction([storeName], 'readwrite');
          const store = transaction.objectStore(storeName);
          
          const request = store.delete(id);

          request.onsuccess = () => resolve(true);
          request.onerror = () => reject(`Error deleting data: ${request.error}`);
      });
  }

  async clearAllResponses(storeName) {
      if (!this.db) await this.openDatabase();

      return new Promise((resolve, reject) => {
          const transaction = this.db.transaction([storeName], 'readwrite');
          const store = transaction.objectStore(storeName);
          
          const request = store.clear();

          request.onsuccess = () => resolve(true);
          request.onerror = () => reject(`Error clearing data: ${request.error}`);
      });
  }

  // Sync method to send data to Google Sheets
  async syncResponses(storeName, scriptURL) {
      try {
          const responses = await this.getAllResponses(storeName);
          
          if (responses.length === 0) {
              console.log(`No pending submissions for ${storeName}`);
              return { synced: true, unsynced: [] };
          }

          const unsyncedResponses = [];

          for (const response of responses) {
              try {
                  const networkResponse = await fetch(scriptURL, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                      body: new URLSearchParams(response),
                  });

                  if (networkResponse.ok) {
                      const serverResponse = await networkResponse.json();
                      if (serverResponse.status === "success") {
                          // Remove successfully synced response
                          await this.deleteResponse(storeName, response.id);
                      } else {
                          unsyncedResponses.push(response);
                      }
                  } else {
                      unsyncedResponses.push(response);
                  }
              } catch (error) {
                  console.error(`Sync error for response:`, error);
                  unsyncedResponses.push(response);
              }
          }

          return { 
              synced: unsyncedResponses.length === 0, 
              unsynced: unsyncedResponses 
          };
      } catch (error) {
          console.error("Sync process error:", error);
          return { synced: false, unsynced: [] };
      }
  }
}

// Utility function to get store name based on form type
function getStoreNameForForm(formType) {
  const storeNames = {
      'deer-cull': 'deer_cull_responses',
      'site-sign-in': 'site_sign_in_responses',
      'observations': 'observations_responses'
  };
  return storeNames[formType] || 'responses';
}

// Utility function to get Google Sheet script URL
function getScriptURLForForm(formType) {
  const scriptURLs = {
      'deer-cull': "https://script.google.com/macros/s/AKfycbz7R7FuRXu4qi_cQd_Rg5sZY-D6pMEVRHol0FQRNuKXbR3MtXau6cnBuDpRxFAaozc/exec",
      'site-sign-in': "https://script.google.com/macros/s/AKfycbyG0-lJ3fKWjBR0ya74y5V02JkDBsZuVdRXTTxU375TQcSNU_41JT8VSGSYbHj-5-js/exec",
      'observations': "https://script.google.com/macros/s/AKfycbywWOzFRrkypAlrbHhdBid60QTn1EurJ7Ko-hnMK3T9iy4nrtyabg6bOqoGrgBMXNDQ/exec"
  };
  return scriptURLs[formType];
}

export { 
  IndexedDBStorage, 
  getStoreNameForForm, 
  getScriptURLForForm 
};