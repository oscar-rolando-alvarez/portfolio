import SimplePeer from 'simple-peer';
import { RTCMessage, PeerConnection, MediaState } from '@/types';

export class WebRTCManager {
  private peers: Map<string, SimplePeer.Instance> = new Map();
  private localStream: MediaStream | null = null;
  private onMessage: ((message: RTCMessage) => void) | null = null;
  private onPeerConnected: ((userId: string) => void) | null = null;
  private onPeerDisconnected: ((userId: string) => void) | null = null;

  constructor() {
    this.setupMediaDevices();
  }

  private async setupMediaDevices() {
    try {
      // Get user media for voice/video chat
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
      });
    } catch (error) {
      console.warn('Failed to get user media:', error);
    }
  }

  // Initialize peer connection
  public initializePeer(userId: string, initiator: boolean = false): SimplePeer.Instance {
    const peer = new SimplePeer({
      initiator,
      trickle: false,
      stream: this.localStream || undefined,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      },
    });

    // Handle peer events
    peer.on('signal', (signal) => {
      // Send signal through Socket.io
      this.sendSignal(userId, signal);
    });

    peer.on('connect', () => {
      console.log(`Connected to peer: ${userId}`);
      this.onPeerConnected?.(userId);
    });

    peer.on('data', (data) => {
      try {
        const message: RTCMessage = JSON.parse(data.toString());
        this.onMessage?.(message);
      } catch (error) {
        console.error('Failed to parse peer message:', error);
      }
    });

    peer.on('stream', (stream) => {
      // Handle incoming media stream
      this.handleIncomingStream(userId, stream);
    });

    peer.on('error', (error) => {
      console.error(`Peer error for ${userId}:`, error);
      this.removePeer(userId);
    });

    peer.on('close', () => {
      console.log(`Peer disconnected: ${userId}`);
      this.removePeer(userId);
      this.onPeerDisconnected?.(userId);
    });

    this.peers.set(userId, peer);
    return peer;
  }

  // Handle incoming signal from another peer
  public handleSignal(userId: string, signal: any) {
    let peer = this.peers.get(userId);
    
    if (!peer) {
      // Create new peer connection if it doesn't exist
      peer = this.initializePeer(userId, false);
    }

    try {
      peer.signal(signal);
    } catch (error) {
      console.error(`Failed to handle signal from ${userId}:`, error);
    }
  }

  // Send message to specific peer
  public sendMessage(userId: string, message: RTCMessage) {
    const peer = this.peers.get(userId);
    if (peer && peer.connected) {
      try {
        peer.send(JSON.stringify(message));
      } catch (error) {
        console.error(`Failed to send message to ${userId}:`, error);
      }
    }
  }

  // Broadcast message to all connected peers
  public broadcastMessage(message: RTCMessage) {
    this.peers.forEach((peer, userId) => {
      if (peer.connected) {
        this.sendMessage(userId, message);
      }
    });
  }

  // Send operation to peers
  public sendOperation(operation: any) {
    const message: RTCMessage = {
      type: 'operation',
      data: operation,
      userId: operation.userId,
      timestamp: Date.now(),
    };
    this.broadcastMessage(message);
  }

  // Send cursor position to peers
  public sendCursorPosition(x: number, y: number, userId: string) {
    const message: RTCMessage = {
      type: 'cursor',
      data: { x, y },
      userId,
      timestamp: Date.now(),
    };
    this.broadcastMessage(message);
  }

  // Enable/disable audio
  public async toggleAudio(enabled: boolean): Promise<boolean> {
    if (!this.localStream) {
      if (enabled) {
        try {
          this.localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
          this.addStreamToPeers();
          return true;
        } catch (error) {
          console.error('Failed to enable audio:', error);
          return false;
        }
      }
      return false;
    }

    const audioTracks = this.localStream.getAudioTracks();
    audioTracks.forEach(track => {
      track.enabled = enabled;
    });

    return enabled;
  }

  // Enable/disable video
  public async toggleVideo(enabled: boolean): Promise<boolean> {
    if (!this.localStream || !this.hasVideoTrack()) {
      if (enabled) {
        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
          
          if (this.localStream) {
            // Add video track to existing stream
            const videoTrack = videoStream.getVideoTracks()[0];
            this.localStream.addTrack(videoTrack);
          } else {
            this.localStream = videoStream;
          }
          
          this.addStreamToPeers();
          return true;
        } catch (error) {
          console.error('Failed to enable video:', error);
          return false;
        }
      }
      return false;
    }

    const videoTracks = this.localStream.getVideoTracks();
    videoTracks.forEach(track => {
      track.enabled = enabled;
    });

    return enabled;
  }

  // Start screen sharing
  public async startScreenShare(): Promise<boolean> {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      // Replace video track with screen share
      if (this.localStream) {
        const videoTracks = this.localStream.getVideoTracks();
        videoTracks.forEach(track => {
          this.localStream!.removeTrack(track);
          track.stop();
        });

        const screenTrack = screenStream.getVideoTracks()[0];
        this.localStream.addTrack(screenTrack);

        // Handle screen share end
        screenTrack.onended = () => {
          this.stopScreenShare();
        };
      }

      this.addStreamToPeers();
      return true;
    } catch (error) {
      console.error('Failed to start screen share:', error);
      return false;
    }
  }

  // Stop screen sharing
  public async stopScreenShare() {
    if (!this.localStream) return;

    const videoTracks = this.localStream.getVideoTracks();
    videoTracks.forEach(track => {
      this.localStream!.removeTrack(track);
      track.stop();
    });

    this.addStreamToPeers();
  }

  // Get current media state
  public getMediaState(): MediaState {
    if (!this.localStream) {
      return { audio: false, video: false, screen: false };
    }

    const audioTracks = this.localStream.getAudioTracks();
    const videoTracks = this.localStream.getVideoTracks();

    return {
      audio: audioTracks.length > 0 && audioTracks[0].enabled,
      video: videoTracks.length > 0 && videoTracks[0].enabled && !this.isScreenShare(),
      screen: videoTracks.length > 0 && this.isScreenShare(),
    };
  }

  // Get local stream
  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  // Get peer stream
  public getPeerStream(userId: string): MediaStream | null {
    const peer = this.peers.get(userId);
    return peer?._remoteStream || null;
  }

  // Remove peer connection
  public removePeer(userId: string) {
    const peer = this.peers.get(userId);
    if (peer) {
      peer.destroy();
      this.peers.delete(userId);
    }
  }

  // Clean up all connections
  public cleanup() {
    this.peers.forEach((peer) => {
      peer.destroy();
    });
    this.peers.clear();

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
  }

  // Event handlers
  public onMessageReceived(handler: (message: RTCMessage) => void) {
    this.onMessage = handler;
  }

  public onPeerConnect(handler: (userId: string) => void) {
    this.onPeerConnected = handler;
  }

  public onPeerDisconnect(handler: (userId: string) => void) {
    this.onPeerDisconnected = handler;
  }

  // Private helper methods
  private sendSignal(userId: string, signal: any) {
    // This should be implemented to send signals through Socket.io
    // Will be connected to the Socket.io manager
    if (window.socketManager) {
      window.socketManager.emit('webrtc:signal', { userId, signal });
    }
  }

  private handleIncomingStream(userId: string, stream: MediaStream) {
    // Store the stream for the specific user
    const peer = this.peers.get(userId);
    if (peer) {
      (peer as any)._remoteStream = stream;
    }

    // Dispatch custom event for UI to handle
    window.dispatchEvent(new CustomEvent('peer-stream', {
      detail: { userId, stream }
    }));
  }

  private addStreamToPeers() {
    if (!this.localStream) return;

    this.peers.forEach((peer) => {
      if (peer.connected) {
        try {
          peer.replaceTrack(
            peer._pc.getSenders()[0]?.track,
            this.localStream!.getTracks()[0],
            peer._pc.getSenders()[0]?.streams[0] || this.localStream!
          );
        } catch (error) {
          console.error('Failed to replace track:', error);
        }
      }
    });
  }

  private hasVideoTrack(): boolean {
    return this.localStream ? this.localStream.getVideoTracks().length > 0 : false;
  }

  private isScreenShare(): boolean {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    return videoTrack ? videoTrack.label.includes('screen') : false;
  }
}

// Global instance
let webRTCManager: WebRTCManager | null = null;

export const getWebRTCManager = (): WebRTCManager => {
  if (!webRTCManager) {
    webRTCManager = new WebRTCManager();
  }
  return webRTCManager;
};

// Declare global for Socket.io integration
declare global {
  interface Window {
    socketManager: any;
  }
}