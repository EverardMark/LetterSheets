'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Minimal, explicit surface exposed to the renderer. No Node access leaks; the
// bearer token lives only in the main process.
contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('config:get'),

  login: (email, password) => ipcRenderer.invoke('auth:login', { email, password }),
  selectCompany: (userId, companyId, companyName, email) =>
    ipcRenderer.invoke('auth:selectCompany', { userId, companyId, companyName, email }),
  logout: () => ipcRenderer.invoke('auth:logout'),

  // Admin-gated kiosk exit
  verifyAdmin: (email, password) => ipcRenderer.invoke('auth:verifyAdmin', { email, password }),
  quitApp: () => ipcRenderer.invoke('app:quit'),

  listEmployees: () => ipcRenderer.invoke('employees:list'),
  todayAttendance: () => ipcRenderer.invoke('attendance:today'),
  clockIn: (employeeId) => ipcRenderer.invoke('attendance:clockIn', { employeeId }),
  clockOut: (attendanceId) => ipcRenderer.invoke('attendance:clockOut', { attendanceId }),

  // Fingerprint templates (stored locally on the kiosk, never sent to the server)
  fpList: () => ipcRenderer.invoke('fp:list'),
  fpEnroll: (employeeId, fingerIndex, template, quality) =>
    ipcRenderer.invoke('fp:enroll', { employeeId, fingerIndex, template, quality }),
  fpDelete: (employeeId, fingerIndex) =>
    ipcRenderer.invoke('fp:delete', { employeeId, fingerIndex }),

  // Face templates (stored locally on the kiosk, encrypted at rest, never sent
  // to the server). faceHealth reports whether the OS keyring is actually
  // protecting them — check it during setup before enrolling anyone.
  faceHealth: () => ipcRenderer.invoke('face:health'),
  faceList: () => ipcRenderer.invoke('face:list'),
  faceEnroll: (employeeId, embedding, quality) =>
    ipcRenderer.invoke('face:enroll', { employeeId, embedding, quality }),
  faceDelete: (employeeId) => ipcRenderer.invoke('face:delete', { employeeId }),
});
