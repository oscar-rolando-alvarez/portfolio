import { 
  Component, 
  Input, 
  Output, 
  EventEmitter, 
  OnInit, 
  OnDestroy, 
  ViewChild, 
  ElementRef, 
  inject,
  signal,
  computed,
  effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

// Video.js imports
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

// Models
import { VideoMetadata, VideoChapter, Subtitle } from '../../../core/models/course.model';

// Services
import { AnalyticsService } from '../../../core/services/analytics.service';
import { NotificationService } from '../../../core/services/notification.service';

export interface VideoPlayerConfig {
  autoplay?: boolean;
  controls?: boolean;
  preload?: 'auto' | 'metadata' | 'none';
  fluid?: boolean;
  responsive?: boolean;
  aspectRatio?: string;
  playbackRates?: number[];
  enableHotkeys?: boolean;
  enablePictureInPicture?: boolean;
  enableFullscreen?: boolean;
  enableTheaterMode?: boolean;
  enableAnnotations?: boolean;
  enableNotes?: boolean;
  enableBookmarks?: boolean;
  enableProgressTracking?: boolean;
  enableAnalytics?: boolean;
}

export interface VideoProgress {
  currentTime: number;
  duration: number;
  percentageComplete: number;
  watchedSegments: Array<{ start: number; end: number }>;
}

export interface VideoNote {
  id: string;
  timestamp: number;
  content: string;
  isPrivate: boolean;
  createdAt: Date;
}

export interface VideoBookmark {
  id: string;
  timestamp: number;
  title: string;
  description?: string;
  createdAt: Date;
}

export interface VideoAnnotation {
  id: string;
  startTime: number;
  endTime: number;
  type: 'text' | 'link' | 'image' | 'quiz';
  content: any;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

@Component({
  selector: 'app-video-player',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MatButtonModule,
    MatIconModule,
    MatSliderModule,
    MatMenuModule,
    MatTooltipModule,
    MatProgressBarModule,
    MatChipsModule
  ],
  template: `
    <div class="video-player-container" [class.theater-mode]="isTheaterMode()">
      <!-- Video Player -->
      <div class="video-wrapper" #videoWrapper>
        <video
          #videoElement
          class="video-js vjs-default-skin"
          [attr.data-setup]="{}"
          preload="metadata"
          controls
          playsinline>
          <p class="vjs-no-js">
            {{ 'VIDEO.NO_JS_MESSAGE' | translate }}
            <a href="https://videojs.com/html5-video-support/" target="_blank">
              {{ 'VIDEO.ENABLE_HTML5_VIDEO' | translate }}
            </a>
          </p>
        </video>

        <!-- Custom Overlay Controls -->
        <div class="video-overlay" *ngIf="showCustomControls()">
          <!-- Loading Spinner -->
          <div class="loading-spinner" *ngIf="isLoading()">
            <mat-progress-bar mode="indeterminate"></mat-progress-bar>
            <span>{{ 'VIDEO.LOADING' | translate }}</span>
          </div>

          <!-- Play/Pause Button -->
          <button
            mat-fab
            class="play-pause-btn"
            (click)="togglePlayPause()"
            [attr.aria-label]="isPlaying() ? ('VIDEO.PAUSE' | translate) : ('VIDEO.PLAY' | translate)"
            *ngIf="!isLoading()">
            <mat-icon>{{ isPlaying() ? 'pause' : 'play_arrow' }}</mat-icon>
          </button>

          <!-- Custom Controls Bar -->
          <div class="custom-controls" *ngIf="!isLoading()">
            <!-- Progress Bar -->
            <div class="progress-container">
              <mat-slider
                class="progress-slider"
                [min]="0"
                [max]="duration()"
                [value]="currentTime()"
                (input)="onSeek($event)"
                [disabled]="!duration()">
              </mat-slider>
              
              <!-- Chapter Markers -->
              <div class="chapter-markers" *ngIf="chapters?.length">
                <div
                  *ngFor="let chapter of chapters"
                  class="chapter-marker"
                  [style.left.%]="(chapter.startTime / duration()) * 100"
                  [matTooltip]="chapter.title"
                  (click)="seekToChapter(chapter)">
                </div>
              </div>

              <!-- Watched Progress -->
              <div class="watched-progress">
                <div
                  *ngFor="let segment of watchedSegments()"
                  class="watched-segment"
                  [style.left.%]="(segment.start / duration()) * 100"
                  [style.width.%]="((segment.end - segment.start) / duration()) * 100">
                </div>
              </div>
            </div>

            <!-- Time Display -->
            <div class="time-display">
              <span class="current-time">{{ formatTime(currentTime()) }}</span>
              <span class="separator">/</span>
              <span class="total-time">{{ formatTime(duration()) }}</span>
            </div>

            <!-- Control Buttons -->
            <div class="control-buttons">
              <!-- Previous Chapter -->
              <button
                mat-icon-button
                (click)="previousChapter()"
                [disabled]="!canGoPreviousChapter()"
                [matTooltip]="'VIDEO.PREVIOUS_CHAPTER' | translate">
                <mat-icon>skip_previous</mat-icon>
              </button>

              <!-- Rewind -->
              <button
                mat-icon-button
                (click)="rewind()"
                [matTooltip]="'VIDEO.REWIND_10S' | translate">
                <mat-icon>replay_10</mat-icon>
              </button>

              <!-- Play/Pause -->
              <button
                mat-icon-button
                class="main-play-btn"
                (click)="togglePlayPause()"
                [matTooltip]="isPlaying() ? ('VIDEO.PAUSE' | translate) : ('VIDEO.PLAY' | translate)">
                <mat-icon>{{ isPlaying() ? 'pause' : 'play_arrow' }}</mat-icon>
              </button>

              <!-- Fast Forward -->
              <button
                mat-icon-button
                (click)="fastForward()"
                [matTooltip]="'VIDEO.FORWARD_10S' | translate">
                <mat-icon>forward_10</mat-icon>
              </button>

              <!-- Next Chapter -->
              <button
                mat-icon-button
                (click)="nextChapter()"
                [disabled]="!canGoNextChapter()"
                [matTooltip]="'VIDEO.NEXT_CHAPTER' | translate">
                <mat-icon>skip_next</mat-icon>
              </button>

              <!-- Volume -->
              <div class="volume-control">
                <button
                  mat-icon-button
                  (click)="toggleMute()"
                  [matTooltip]="isMuted() ? ('VIDEO.UNMUTE' | translate) : ('VIDEO.MUTE' | translate)">
                  <mat-icon>{{ getVolumeIcon() }}</mat-icon>
                </button>
                <mat-slider
                  class="volume-slider"
                  [min]="0"
                  [max]="1"
                  [step]="0.1"
                  [value]="volume()"
                  (input)="onVolumeChange($event)">
                </mat-slider>
              </div>

              <!-- Playback Speed -->
              <button
                mat-icon-button
                [matMenuTriggerFor]="speedMenu"
                [matTooltip]="'VIDEO.PLAYBACK_SPEED' | translate">
                <mat-icon>speed</mat-icon>
              </button>

              <!-- Quality -->
              <button
                mat-icon-button
                [matMenuTriggerFor]="qualityMenu"
                [matTooltip]="'VIDEO.QUALITY' | translate"
                *ngIf="availableQualities?.length">
                <mat-icon>hd</mat-icon>
              </button>

              <!-- Subtitles -->
              <button
                mat-icon-button
                [matMenuTriggerFor]="subtitleMenu"
                [matTooltip]="'VIDEO.SUBTITLES' | translate"
                *ngIf="subtitles?.length">
                <mat-icon>closed_caption</mat-icon>
              </button>

              <!-- Picture-in-Picture -->
              <button
                mat-icon-button
                (click)="togglePictureInPicture()"
                [disabled]="!isPipSupported()"
                [matTooltip]="'VIDEO.PICTURE_IN_PICTURE' | translate">
                <mat-icon>picture_in_picture_alt</mat-icon>
              </button>

              <!-- Theater Mode -->
              <button
                mat-icon-button
                (click)="toggleTheaterMode()"
                [matTooltip]="'VIDEO.THEATER_MODE' | translate">
                <mat-icon>{{ isTheaterMode() ? 'fullscreen_exit' : 'fullscreen' }}</mat-icon>
              </button>

              <!-- Fullscreen -->
              <button
                mat-icon-button
                (click)="toggleFullscreen()"
                [matTooltip]="'VIDEO.FULLSCREEN' | translate">
                <mat-icon>{{ isFullscreen() ? 'fullscreen_exit' : 'fullscreen' }}</mat-icon>
              </button>
            </div>
          </div>
        </div>

        <!-- Video Annotations -->
        <div class="video-annotations" *ngIf="annotations?.length && showAnnotations()">
          <div
            *ngFor="let annotation of getCurrentAnnotations()"
            class="video-annotation"
            [style.left.px]="annotation.position.x"
            [style.top.px]="annotation.position.y"
            [style.width.px]="annotation.size.width"
            [style.height.px]="annotation.size.height"
            [class]="'annotation-' + annotation.type">
            <!-- Annotation content based on type -->
            <ng-container [ngSwitch]="annotation.type">
              <div *ngSwitchCase="'text'" class="text-annotation">
                {{ annotation.content.text }}
              </div>
              <a *ngSwitchCase="'link'" class="link-annotation" [href]="annotation.content.url" target="_blank">
                {{ annotation.content.text }}
              </a>
              <img *ngSwitchCase="'image'" class="image-annotation" [src]="annotation.content.url" [alt]="annotation.content.alt">
              <div *ngSwitchCase="'quiz'" class="quiz-annotation">
                <button mat-button (click)="openQuizAnnotation(annotation)">
                  {{ annotation.content.question }}
                </button>
              </div>
            </ng-container>
          </div>
        </div>
      </div>

      <!-- Side Panel -->
      <div class="side-panel" *ngIf="showSidePanel()">
        <!-- Tabs -->
        <mat-tab-group [(selectedIndex)]="selectedTab()">
          <!-- Chapters Tab -->
          <mat-tab [label]="'VIDEO.CHAPTERS' | translate" *ngIf="chapters?.length">
            <div class="chapters-list">
              <div
                *ngFor="let chapter of chapters; let i = index"
                class="chapter-item"
                [class.active]="currentChapter() === i"
                (click)="seekToChapter(chapter)">
                <img [src]="chapter.thumbnail || '/assets/images/chapter-placeholder.jpg'" [alt]="chapter.title" class="chapter-thumbnail">
                <div class="chapter-info">
                  <h4 class="chapter-title">{{ chapter.title }}</h4>
                  <span class="chapter-time">{{ formatTime(chapter.startTime) }}</span>
                </div>
              </div>
            </div>
          </mat-tab>

          <!-- Notes Tab -->
          <mat-tab [label]="'VIDEO.NOTES' | translate" *ngIf="enableNotes">
            <div class="notes-panel">
              <div class="add-note">
                <button mat-button (click)="addNote()" [disabled]="!isPlaying() && currentTime() === 0">
                  <mat-icon>add</mat-icon>
                  {{ 'VIDEO.ADD_NOTE' | translate }}
                </button>
              </div>
              <div class="notes-list">
                <div
                  *ngFor="let note of notes"
                  class="note-item"
                  (click)="seekToTime(note.timestamp)">
                  <div class="note-timestamp">{{ formatTime(note.timestamp) }}</div>
                  <div class="note-content">{{ note.content }}</div>
                  <button mat-icon-button class="delete-note" (click)="deleteNote(note.id); $event.stopPropagation()">
                    <mat-icon>delete</mat-icon>
                  </button>
                </div>
              </div>
            </div>
          </mat-tab>

          <!-- Bookmarks Tab -->
          <mat-tab [label]="'VIDEO.BOOKMARKS' | translate" *ngIf="enableBookmarks">
            <div class="bookmarks-panel">
              <div class="add-bookmark">
                <button mat-button (click)="addBookmark()" [disabled]="!isPlaying() && currentTime() === 0">
                  <mat-icon>bookmark_add</mat-icon>
                  {{ 'VIDEO.ADD_BOOKMARK' | translate }}
                </button>
              </div>
              <div class="bookmarks-list">
                <div
                  *ngFor="let bookmark of bookmarks"
                  class="bookmark-item"
                  (click)="seekToTime(bookmark.timestamp)">
                  <mat-icon class="bookmark-icon">bookmark</mat-icon>
                  <div class="bookmark-info">
                    <div class="bookmark-title">{{ bookmark.title }}</div>
                    <div class="bookmark-time">{{ formatTime(bookmark.timestamp) }}</div>
                    <div class="bookmark-description" *ngIf="bookmark.description">{{ bookmark.description }}</div>
                  </div>
                  <button mat-icon-button class="delete-bookmark" (click)="deleteBookmark(bookmark.id); $event.stopPropagation()">
                    <mat-icon>delete</mat-icon>
                  </button>
                </div>
              </div>
            </div>
          </mat-tab>

          <!-- Transcript Tab -->
          <mat-tab [label]="'VIDEO.TRANSCRIPT' | translate" *ngIf="transcript">
            <div class="transcript-panel">
              <div class="transcript-content" [innerHTML]="transcript"></div>
            </div>
          </mat-tab>
        </mat-tab-group>
      </div>

      <!-- Menus -->
      <mat-menu #speedMenu="matMenu">
        <button
          mat-menu-item
          *ngFor="let speed of playbackSpeeds"
          (click)="setPlaybackSpeed(speed)"
          [class.active]="playbackSpeed() === speed">
          {{ speed }}x
        </button>
      </mat-menu>

      <mat-menu #qualityMenu="matMenu">
        <button
          mat-menu-item
          *ngFor="let quality of availableQualities"
          (click)="setQuality(quality)"
          [class.active]="currentQuality() === quality">
          {{ quality }}
        </button>
      </mat-menu>

      <mat-menu #subtitleMenu="matMenu">
        <button
          mat-menu-item
          (click)="toggleSubtitles()"
          [class.active]="subtitlesEnabled()">
          {{ 'VIDEO.SUBTITLES_OFF' | translate }}
        </button>
        <button
          mat-menu-item
          *ngFor="let subtitle of subtitles"
          (click)="setSubtitle(subtitle)"
          [class.active]="currentSubtitle()?.language === subtitle.language">
          {{ subtitle.language | uppercase }}
        </button>
      </mat-menu>
    </div>
  `,
  styles: [`
    .video-player-container {
      display: flex;
      background: #000;
      position: relative;
      width: 100%;
      height: 100%;
    }

    .video-wrapper {
      flex: 1;
      position: relative;
      overflow: hidden;
    }

    .video-js {
      width: 100%;
      height: 100%;
    }

    .video-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      pointer-events: none;
    }

    .video-overlay > * {
      pointer-events: auto;
    }

    .loading-spinner {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      color: white;
    }

    .play-pause-btn {
      background: rgba(0, 0, 0, 0.7);
      color: white;
      width: 80px;
      height: 80px;
    }

    .custom-controls {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
      color: white;
      padding: 20px;
      transform: translateY(100%);
      transition: transform 0.3s ease;
    }

    .video-wrapper:hover .custom-controls,
    .custom-controls:focus-within {
      transform: translateY(0);
    }

    .progress-container {
      position: relative;
      margin-bottom: 16px;
    }

    .progress-slider {
      width: 100%;
    }

    .chapter-markers {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      pointer-events: none;
    }

    .chapter-marker {
      position: absolute;
      width: 2px;
      height: 100%;
      background: #fff;
      cursor: pointer;
      pointer-events: auto;
    }

    .watched-progress {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      pointer-events: none;
    }

    .watched-segment {
      position: absolute;
      height: 100%;
      background: rgba(255, 255, 255, 0.3);
    }

    .time-display {
      display: flex;
      align-items: center;
      gap: 4px;
      font-family: monospace;
      font-size: 14px;
      margin-bottom: 16px;
    }

    .control-buttons {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .main-play-btn {
      background: var(--primary-color);
      color: white;
    }

    .volume-control {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .volume-slider {
      width: 80px;
    }

    .side-panel {
      width: 350px;
      background: var(--background-primary);
      border-left: 1px solid var(--divider-color);
      display: flex;
      flex-direction: column;
    }

    .chapters-list,
    .notes-list,
    .bookmarks-list {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }

    .chapter-item {
      display: flex;
      gap: 12px;
      padding: 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .chapter-item:hover {
      background: var(--background-secondary);
    }

    .chapter-item.active {
      background: var(--primary-color);
      color: white;
    }

    .chapter-thumbnail {
      width: 60px;
      height: 40px;
      object-fit: cover;
      border-radius: 4px;
    }

    .chapter-info {
      flex: 1;
    }

    .chapter-title {
      margin: 0 0 4px 0;
      font-size: 14px;
      font-weight: 500;
    }

    .chapter-time {
      font-size: 12px;
      color: var(--text-secondary);
    }

    .notes-panel,
    .bookmarks-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .add-note,
    .add-bookmark {
      padding: 16px;
      border-bottom: 1px solid var(--divider-color);
    }

    .note-item,
    .bookmark-item {
      padding: 12px;
      border-bottom: 1px solid var(--divider-color);
      cursor: pointer;
      position: relative;
    }

    .note-item:hover,
    .bookmark-item:hover {
      background: var(--background-secondary);
    }

    .note-timestamp,
    .bookmark-time {
      font-size: 12px;
      color: var(--primary-color);
      font-weight: 500;
    }

    .note-content {
      margin-top: 4px;
      font-size: 14px;
    }

    .bookmark-item {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }

    .bookmark-icon {
      color: var(--primary-color);
      margin-top: 2px;
    }

    .bookmark-info {
      flex: 1;
    }

    .bookmark-title {
      font-weight: 500;
      margin-bottom: 2px;
    }

    .bookmark-description {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 4px;
    }

    .delete-note,
    .delete-bookmark {
      position: absolute;
      top: 8px;
      right: 8px;
      opacity: 0;
      transition: opacity 0.2s;
    }

    .note-item:hover .delete-note,
    .bookmark-item:hover .delete-bookmark {
      opacity: 1;
    }

    .transcript-panel {
      padding: 16px;
      height: 100%;
      overflow-y: auto;
    }

    .transcript-content {
      line-height: 1.6;
      font-size: 14px;
    }

    .video-annotations {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
    }

    .video-annotation {
      position: absolute;
      pointer-events: auto;
      z-index: 10;
    }

    .text-annotation {
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 14px;
    }

    .link-annotation {
      background: var(--primary-color);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      text-decoration: none;
      font-size: 14px;
    }

    .image-annotation {
      max-width: 100%;
      max-height: 100%;
      border-radius: 4px;
    }

    .quiz-annotation button {
      background: var(--accent-color);
      color: white;
    }

    .theater-mode {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 9999;
      background: #000;
    }

    .theater-mode .side-panel {
      width: 400px;
    }

    /* Responsive design */
    @media (max-width: 768px) {
      .side-panel {
        display: none;
      }

      .control-buttons {
        flex-wrap: wrap;
        gap: 4px;
      }

      .volume-control {
        display: none;
      }
    }

    /* Accessibility */
    @media (prefers-reduced-motion: reduce) {
      .custom-controls {
        transition: none;
      }

      .chapter-item,
      .note-item,
      .bookmark-item {
        transition: none;
      }
    }

    /* High contrast mode */
    @media (prefers-contrast: high) {
      .custom-controls {
        background: rgba(0, 0, 0, 0.95);
        border-top: 2px solid white;
      }

      .chapter-item,
      .note-item,
      .bookmark-item {
        border: 1px solid var(--text-primary);
      }
    }
  `]
})
export class VideoPlayerComponent implements OnInit, OnDestroy {
  @ViewChild('videoElement', { static: true }) videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('videoWrapper', { static: true }) videoWrapper!: ElementRef<HTMLDivElement>;

  @Input() videoMetadata!: VideoMetadata;
  @Input() chapters: VideoChapter[] = [];
  @Input() subtitles: Subtitle[] = [];
  @Input() annotations: VideoAnnotation[] = [];
  @Input() transcript?: string;
  @Input() config: VideoPlayerConfig = {};
  @Input() enableNotes = true;
  @Input() enableBookmarks = true;
  @Input() notes: VideoNote[] = [];
  @Input() bookmarks: VideoBookmark[] = [];

  @Output() progressUpdate = new EventEmitter<VideoProgress>();
  @Output() noteAdded = new EventEmitter<Partial<VideoNote>>();
  @Output() noteDeleted = new EventEmitter<string>();
  @Output() bookmarkAdded = new EventEmitter<Partial<VideoBookmark>>();
  @Output() bookmarkDeleted = new EventEmitter<string>();
  @Output() completed = new EventEmitter<void>();

  private readonly analyticsService = inject(AnalyticsService);
  private readonly notificationService = inject(NotificationService);

  // Video.js player instance
  private player!: any;

  // Signals for reactive state
  protected readonly isLoading = signal(true);
  protected readonly isPlaying = signal(false);
  protected readonly currentTime = signal(0);
  protected readonly duration = signal(0);
  protected readonly volume = signal(1);
  protected readonly isMuted = signal(false);
  protected readonly playbackSpeed = signal(1);
  protected readonly currentQuality = signal('720p');
  protected readonly isFullscreen = signal(false);
  protected readonly isTheaterMode = signal(false);
  protected readonly isPipSupported = signal(false);
  protected readonly showCustomControls = signal(true);
  protected readonly showSidePanel = signal(true);
  protected readonly showAnnotations = signal(true);
  protected readonly selectedTab = signal(0);
  protected readonly currentChapter = signal(0);
  protected readonly subtitlesEnabled = signal(false);
  protected readonly currentSubtitle = signal<Subtitle | null>(null);

  // Computed values
  protected readonly watchedSegments = computed(() => {
    // Calculate watched segments based on progress tracking
    return [];
  });

  protected readonly percentageComplete = computed(() => {
    const dur = this.duration();
    return dur > 0 ? (this.currentTime() / dur) * 100 : 0;
  });

  // Configuration
  protected readonly playbackSpeeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  protected readonly availableQualities = ['360p', '480p', '720p', '1080p'];

  // Progress tracking
  private progressTimer?: number;
  private lastProgressUpdate = 0;
  private watchedSegmentsData: Array<{ start: number; end: number }> = [];

  constructor() {
    // Check Picture-in-Picture support
    this.isPipSupported.set('pictureInPictureEnabled' in document);

    // Set up effects
    effect(() => {
      if (this.player && this.currentTime()) {
        this.updateCurrentChapter();
      }
    });
  }

  ngOnInit(): void {
    this.initializePlayer();
  }

  ngOnDestroy(): void {
    this.destroyPlayer();
    if (this.progressTimer) {
      clearInterval(this.progressTimer);
    }
  }

  private initializePlayer(): void {
    const options = {
      controls: false, // We'll use custom controls
      fluid: true,
      responsive: true,
      preload: this.config.preload || 'metadata',
      autoplay: this.config.autoplay || false,
      playbackRates: this.config.playbackRates || this.playbackSpeeds,
      html5: {
        hls: {
          enableLowInitialPlaylist: true,
          smoothQualityChange: true,
          overrideNative: true
        }
      },
      sources: [
        {
          src: this.videoMetadata.streamingUrl,
          type: 'application/x-mpegURL' // HLS
        }
      ],
      tracks: this.subtitles.map(subtitle => ({
        kind: 'subtitles',
        src: subtitle.url,
        srclang: subtitle.language,
        label: subtitle.language.toUpperCase(),
        default: subtitle.isDefault
      }))
    };

    this.player = videojs(this.videoElement.nativeElement, options);

    this.setupPlayerEvents();
    this.setupKeyboardShortcuts();
    this.startProgressTracking();
  }

  private setupPlayerEvents(): void {
    this.player.ready(() => {
      this.isLoading.set(false);
      this.duration.set(this.player.duration() || 0);
    });

    this.player.on('loadstart', () => {
      this.isLoading.set(true);
    });

    this.player.on('canplay', () => {
      this.isLoading.set(false);
    });

    this.player.on('play', () => {
      this.isPlaying.set(true);
      this.analyticsService.trackVideoEvent('play', {
        videoId: this.videoMetadata.id,
        currentTime: this.currentTime()
      });
    });

    this.player.on('pause', () => {
      this.isPlaying.set(false);
      this.analyticsService.trackVideoEvent('pause', {
        videoId: this.videoMetadata.id,
        currentTime: this.currentTime()
      });
    });

    this.player.on('timeupdate', () => {
      this.currentTime.set(this.player.currentTime() || 0);
    });

    this.player.on('volumechange', () => {
      this.volume.set(this.player.volume());
      this.isMuted.set(this.player.muted());
    });

    this.player.on('ratechange', () => {
      this.playbackSpeed.set(this.player.playbackRate());
    });

    this.player.on('fullscreenchange', () => {
      this.isFullscreen.set(this.player.isFullscreen());
    });

    this.player.on('ended', () => {
      this.completed.emit();
      this.analyticsService.trackVideoEvent('completed', {
        videoId: this.videoMetadata.id,
        duration: this.duration(),
        watchTime: this.duration()
      });
    });

    this.player.on('error', (error: any) => {
      console.error('Video player error:', error);
      this.notificationService.showError('Video playback error occurred');
    });
  }

  private setupKeyboardShortcuts(): void {
    if (!this.config.enableHotkeys) return;

    document.addEventListener('keydown', (event) => {
      if (!this.player || event.target !== document.body) return;

      switch (event.code) {
        case 'Space':
          event.preventDefault();
          this.togglePlayPause();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          this.rewind();
          break;
        case 'ArrowRight':
          event.preventDefault();
          this.fastForward();
          break;
        case 'ArrowUp':
          event.preventDefault();
          this.changeVolume(0.1);
          break;
        case 'ArrowDown':
          event.preventDefault();
          this.changeVolume(-0.1);
          break;
        case 'KeyM':
          event.preventDefault();
          this.toggleMute();
          break;
        case 'KeyF':
          event.preventDefault();
          this.toggleFullscreen();
          break;
        case 'KeyT':
          event.preventDefault();
          this.toggleTheaterMode();
          break;
      }
    });
  }

  private startProgressTracking(): void {
    this.progressTimer = setInterval(() => {
      if (this.isPlaying()) {
        const currentTime = this.currentTime();
        const duration = this.duration();
        
        if (currentTime > this.lastProgressUpdate + 5) { // Update every 5 seconds
          this.lastProgressUpdate = currentTime;
          
          const progress: VideoProgress = {
            currentTime,
            duration,
            percentageComplete: this.percentageComplete(),
            watchedSegments: this.watchedSegmentsData
          };
          
          this.progressUpdate.emit(progress);
        }
      }
    }, 1000);
  }

  private destroyPlayer(): void {
    if (this.player) {
      this.player.dispose();
    }
  }

  // Player Controls
  protected togglePlayPause(): void {
    if (this.isPlaying()) {
      this.player.pause();
    } else {
      this.player.play();
    }
  }

  protected rewind(seconds = 10): void {
    const newTime = Math.max(0, this.currentTime() - seconds);
    this.player.currentTime(newTime);
  }

  protected fastForward(seconds = 10): void {
    const newTime = Math.min(this.duration(), this.currentTime() + seconds);
    this.player.currentTime(newTime);
  }

  protected onSeek(event: any): void {
    const time = event.value;
    this.player.currentTime(time);
  }

  protected seekToTime(time: number): void {
    this.player.currentTime(time);
  }

  protected toggleMute(): void {
    this.player.muted(!this.isMuted());
  }

  protected onVolumeChange(event: any): void {
    this.player.volume(event.value);
  }

  protected changeVolume(delta: number): void {
    const newVolume = Math.max(0, Math.min(1, this.volume() + delta));
    this.player.volume(newVolume);
  }

  protected setPlaybackSpeed(speed: number): void {
    this.player.playbackRate(speed);
  }

  protected setQuality(quality: string): void {
    // Implementation depends on HLS.js or video source switching
    this.currentQuality.set(quality);
  }

  protected toggleSubtitles(): void {
    const tracks = this.player.textTracks();
    if (tracks.length > 0) {
      const isEnabled = this.subtitlesEnabled();
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].mode = isEnabled ? 'hidden' : 'showing';
      }
      this.subtitlesEnabled.set(!isEnabled);
    }
  }

  protected setSubtitle(subtitle: Subtitle): void {
    this.currentSubtitle.set(subtitle);
    // Implementation to switch subtitle track
  }

  protected togglePictureInPicture(): void {
    if (this.isPipSupported()) {
      const video = this.videoElement.nativeElement;
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture();
      } else {
        video.requestPictureInPicture();
      }
    }
  }

  protected toggleTheaterMode(): void {
    this.isTheaterMode.set(!this.isTheaterMode());
  }

  protected toggleFullscreen(): void {
    this.player.requestFullscreen();
  }

  // Chapter Navigation
  protected seekToChapter(chapter: VideoChapter): void {
    this.player.currentTime(chapter.startTime);
  }

  protected previousChapter(): void {
    const currentChapter = this.currentChapter();
    if (currentChapter > 0) {
      this.seekToChapter(this.chapters[currentChapter - 1]);
    }
  }

  protected nextChapter(): void {
    const currentChapter = this.currentChapter();
    if (currentChapter < this.chapters.length - 1) {
      this.seekToChapter(this.chapters[currentChapter + 1]);
    }
  }

  protected canGoPreviousChapter(): boolean {
    return this.currentChapter() > 0;
  }

  protected canGoNextChapter(): boolean {
    return this.currentChapter() < this.chapters.length - 1;
  }

  private updateCurrentChapter(): void {
    const currentTime = this.currentTime();
    for (let i = this.chapters.length - 1; i >= 0; i--) {
      if (currentTime >= this.chapters[i].startTime) {
        this.currentChapter.set(i);
        break;
      }
    }
  }

  // Notes and Bookmarks
  protected addNote(): void {
    const timestamp = this.currentTime();
    const note: Partial<VideoNote> = {
      timestamp,
      content: '',
      isPrivate: true
    };
    this.noteAdded.emit(note);
  }

  protected deleteNote(noteId: string): void {
    this.noteDeleted.emit(noteId);
  }

  protected addBookmark(): void {
    const timestamp = this.currentTime();
    const bookmark: Partial<VideoBookmark> = {
      timestamp,
      title: `Bookmark at ${this.formatTime(timestamp)}`
    };
    this.bookmarkAdded.emit(bookmark);
  }

  protected deleteBookmark(bookmarkId: string): void {
    this.bookmarkDeleted.emit(bookmarkId);
  }

  // Annotations
  protected getCurrentAnnotations(): VideoAnnotation[] {
    const currentTime = this.currentTime();
    return this.annotations.filter(
      annotation => currentTime >= annotation.startTime && currentTime <= annotation.endTime
    );
  }

  protected openQuizAnnotation(annotation: VideoAnnotation): void {
    // Open quiz modal or component
    console.log('Opening quiz annotation:', annotation);
  }

  // Utility Methods
  protected formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  }

  protected getVolumeIcon(): string {
    if (this.isMuted() || this.volume() === 0) {
      return 'volume_off';
    } else if (this.volume() < 0.5) {
      return 'volume_down';
    } else {
      return 'volume_up';
    }
  }
}