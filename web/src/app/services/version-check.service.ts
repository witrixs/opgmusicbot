import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { CURRENT_VERSION } from '../constants/version';

const GITHUB_API = 'https://api.github.com/repos/witrixs/opgmusicbot/releases/latest';
const CACHE_KEY = 'opgbot_release_cache';
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 минут

export interface VersionState {
  currentVersion: string;
  latestVersion: string | null;
  releaseUrl: string | null;
  hasUpdate: boolean;
  isLoading: boolean;
  error: boolean;
}

interface CachedRelease {
  version: string;
  url: string;
  timestamp: number;
}

function compareVersions(a: string, b: string): number {
  const partsA = a.replace(/^v/, '').split('.').map(Number);
  const partsB = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const x = partsA[i] ?? 0;
    const y = partsB[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

function getCached(): CachedRelease | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setCache(version: string, url: string): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      version,
      url,
      timestamp: Date.now()
    }));
  } catch {}
}

@Injectable({ providedIn: 'root' })
export class VersionCheckService {
  private readonly state$ = new BehaviorSubject<VersionState>({
    currentVersion: CURRENT_VERSION,
    latestVersion: null,
    releaseUrl: null,
    hasUpdate: false,
    isLoading: true,
    error: false
  });

  constructor(private readonly http: HttpClient) {}

  getState(): Observable<VersionState> {
    return this.state$.asObservable();
  }

  getStateSnapshot(): VersionState {
    return this.state$.value;
  }

  check(): void {
    const cached = getCached();
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
      this.applyResult(cached.version, cached.url, false);
      return;
    }

    this.state$.next({
      ...this.state$.value,
      isLoading: true,
      error: false
    });

    this.http.get<{ tag_name?: string; html_url?: string }>(GITHUB_API, {
      headers: { Accept: 'application/vnd.github.v3+json' }
    }).pipe(
      map(res => ({
        version: (res.tag_name ?? '').replace(/^v/, ''),
        url: res.html_url ?? ''
      })),
      tap(({ version, url }) => {
        if (version) setCache(version, url);
      }),
      catchError(() => {
        if (cached) {
          return of({ version: cached.version, url: cached.url });
        }
        return of({ version: '', url: '' });
      })
    ).subscribe(({ version, url }) => {
      this.applyResult(version, url, !version);
    });
  }

  private applyResult(latestVersion: string, releaseUrl: string, error: boolean): void {
    const current = CURRENT_VERSION.replace(/^v/, '');
    const latest = latestVersion.replace(/^v/, '');
    const hasUpdate = !!latest && compareVersions(current, latest) < 0;
    this.state$.next({
      currentVersion: CURRENT_VERSION,
      latestVersion: latest || null,
      releaseUrl: releaseUrl || null,
      hasUpdate,
      isLoading: false,
      error
    });
  }
}
