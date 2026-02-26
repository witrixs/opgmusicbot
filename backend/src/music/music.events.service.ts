import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export type MusicStateChangedEvent = {
  guildId: string;
  reason: string;
};

@Injectable()
export class MusicEventsService {
  private readonly subject = new Subject<MusicStateChangedEvent>();
  readonly events$ = this.subject.asObservable();

  emit(guildId: string, reason: string): void {
    this.subject.next({ guildId, reason });
  }
}

