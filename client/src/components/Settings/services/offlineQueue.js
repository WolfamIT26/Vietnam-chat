// Offline Queue Manager - Handles offline changes and syncs when online

class OfflineQueue {
  constructor() {
    this.queueKey = 'settings_offline_queue';
    this.init();
  }

  init() {
    // Listen for online/offline events
    window.addEventListener('online', () => this.syncQueue());
    window.addEventListener('offline', () => console.log('Offline - changes will be queued'));
    
    // Sync on initialization if online
    if (navigator.onLine) {
      this.syncQueue();
    }
  }

  add(endpoint, options) {
    const queue = this.getQueue();
    queue.push({
      id: Date.now(),
      endpoint,
      options,
      timestamp: new Date().toISOString()
    });
    this.saveQueue(queue);
    console.log('Added to offline queue:', endpoint);
  }

  getQueue() {
    try {
      const queue = localStorage.getItem(this.queueKey);
      return queue ? JSON.parse(queue) : [];
    } catch (error) {
      console.error('Error reading offline queue:', error);
      return [];
    }
  }

  saveQueue(queue) {
    try {
      localStorage.setItem(this.queueKey, JSON.stringify(queue));
    } catch (error) {
      console.error('Error saving offline queue:', error);
    }
  }

  async syncQueue() {
    if (!navigator.onLine) {
      console.log('Still offline, cannot sync');
      return;
    }

    const queue = this.getQueue();
    if (queue.length === 0) {
      return;
    }

    console.log(`Syncing ${queue.length} queued changes...`);
    const failed = [];

    for (const item of queue) {
      try {
        const token = localStorage.getItem('token');
        const config = {
          ...item.options,
          headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...item.options.headers,
          },
        };

        const BASE_URL = process.env.REACT_APP_USE_MOCK_SERVER === 'true' 
          ? (process.env.REACT_APP_MOCK_SERVER_URL || 'http://localhost:3001')
          : (process.env.REACT_APP_API_URL || 'http://localhost:5000');

        const response = await fetch(`${BASE_URL}${item.endpoint}`, config);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        console.log('Synced:', item.endpoint);
      } catch (error) {
        console.error('Failed to sync:', item.endpoint, error);
        failed.push(item);
      }
    }

    // Save failed items back to queue
    this.saveQueue(failed);
    
    if (failed.length === 0) {
      console.log('All changes synced successfully!');
    } else {
      console.log(`${failed.length} changes failed to sync`);
    }
  }

  clear() {
    localStorage.removeItem(this.queueKey);
  }
}

export const offlineQueue = new OfflineQueue();
