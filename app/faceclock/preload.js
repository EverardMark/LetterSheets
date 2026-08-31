'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * The renderer's entire view of the outside world.
 *
 * Deliberately a fixed list of calls rather than a generic `invoke(channel)`:
 * the renderer loads ONNX models and drives a camera, so if anything in it is
 * ever compromised the blast radius should be these operations and not "any
 * IPC channel the main process happens to expose".
 *
 * Note what is absent — there is no way to ask for the session token or the
 * company key. Templates arrive already decrypted and leave as plain vectors;
 * the crypto stays on the other side of this bridge.
 */
contextBridge.exposeInMainWorld('api', {
  // Config & models
  getConfig: () => ipcRenderer.invoke('config:get'),
  modelStatus: () => ipcRenderer.invoke('models:status'),
  readModel: (name) => ipcRenderer.invoke('models:read', { name }),

  // Device sign-in
  login: (email, password) => ipcRenderer.invoke('auth:login', { email, password }),
  selectCompany: (payload) => ipcRenderer.invoke('auth:selectCompany', payload),
  verifyAdmin: (email, password) => ipcRenderer.invoke('auth:verifyAdmin', { email, password }),
  signOut: () => ipcRenderer.invoke('auth:signOut'),
  exitApp: () => ipcRenderer.invoke('app:exit'),

  // Roster & attendance
  listEmployees: () => ipcRenderer.invoke('employees:list'),
  attendanceToday: () => ipcRenderer.invoke('attendance:today'),
  clockIn: (employeeId) => ipcRenderer.invoke('attendance:clockIn', { employeeId }),
  clockOut: (attendanceId) => ipcRenderer.invoke('attendance:clockOut', { attendanceId }),

  // Face templates
  faceSync: () => ipcRenderer.invoke('face:sync'),
  faceEnroll: (employeeId, embedding, quality) =>
    ipcRenderer.invoke('face:enroll', { employeeId, embedding, quality }),
  faceDelete: (employeeId) => ipcRenderer.invoke('face:delete', { employeeId }),
});
