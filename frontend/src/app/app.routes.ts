import { Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login').then((module) => module.Login),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register').then((module) => module.Register),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((module) => module.Shell),
    children: [
      { path: '', loadComponent: () => import('./features/dashboard/dashboard').then((module) => module.Dashboard) },
      { path: 'tasks', loadComponent: () => import('./features/tasks/tasks').then((module) => module.Tasks) },
      { path: 'calendar', loadComponent: () => import('./features/calendar/calendar').then((module) => module.Calendar) },
      { path: 'history', loadComponent: () => import('./features/history/history').then((module) => module.History) },
      {
        path: 'statistics',
        loadComponent: () => import('./features/statistics/statistics').then((module) => module.Statistics),
      },
      {
        path: 'achievements',
        loadComponent: () => import('./features/achievements/achievements').then((module) => module.Achievements),
      },
      { path: 'profile', loadComponent: () => import('./features/profile/profile').then((module) => module.Profile) },
    ],
  },
  { path: '**', redirectTo: '' },
];
