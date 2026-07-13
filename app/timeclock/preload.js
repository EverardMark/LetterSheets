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

  // Fingerprint templates (persisted in the ERP)
  fpList: () => ipcRenderer.invoke('fp:list'),
  fpEnroll: (employeeId, fingerIndex, template, quality) =>
    ipcRenderer.invoke('fp:enroll', { employeeId, fingerIndex, template, quality }),
  fpDelete: (employeeId, fingerIndex) =>
    ipcRenderer.invoke('fp:delete', { employeeId, fingerIndex }),
});
