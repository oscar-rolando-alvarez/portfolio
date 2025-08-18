import { Operation, OperationResult } from '@/types';

/**
 * Operational Transformation (OT) for collaborative editing
 * 
 * This implementation handles conflicts between concurrent operations
 * using a combination of vector clocks and operation transformation rules.
 */

export class OperationalTransform {
  private operationHistory: Operation[] = [];
  private vectorClock: Map<string, number> = new Map();

  constructor() {}

  /**
   * Transform an incoming operation against local operations
   */
  public transformOperation(
    incomingOp: Operation,
    localOps: Operation[]
  ): OperationResult {
    let transformedOp = { ...incomingOp };
    const transformedOps: Operation[] = [];

    // Sort local operations by timestamp to ensure consistent transformation
    const sortedLocalOps = localOps.sort((a, b) => a.timestamp - b.timestamp);

    for (const localOp of sortedLocalOps) {
      if (this.shouldTransform(transformedOp, localOp)) {
        const result = this.transformOperationPair(transformedOp, localOp);
        transformedOp = result.op1;
        transformedOps.push(result.op2);
      }
    }

    return {
      operation: transformedOp,
      transformedOps,
    };
  }

  /**
   * Determine if two operations need transformation
   */
  private shouldTransform(op1: Operation, op2: Operation): boolean {
    // Don't transform operations from the same user
    if (op1.userId === op2.userId) return false;

    // Don't transform if operations are on different objects
    if (op1.objectId !== op2.objectId && !this.operationsOverlap(op1, op2)) {
      return false;
    }

    // Transform if operations are concurrent
    return this.areConcurrent(op1, op2);
  }

  /**
   * Check if two operations are concurrent
   */
  private areConcurrent(op1: Operation, op2: Operation): boolean {
    const timeDiff = Math.abs(op1.timestamp - op2.timestamp);
    return timeDiff < 1000; // Consider operations within 1 second as concurrent
  }

  /**
   * Check if operations overlap spatially
   */
  private operationsOverlap(op1: Operation, op2: Operation): boolean {
    if (!op1.data || !op2.data) return false;

    const bounds1 = this.getOperationBounds(op1);
    const bounds2 = this.getOperationBounds(op2);

    if (!bounds1 || !bounds2) return false;

    return !(
      bounds1.right < bounds2.left ||
      bounds2.right < bounds1.left ||
      bounds1.bottom < bounds2.top ||
      bounds2.bottom < bounds1.top
    );
  }

  /**
   * Get bounding box of an operation
   */
  private getOperationBounds(op: Operation) {
    const data = op.data;
    if (!data) return null;

    let left = data.left || 0;
    let top = data.top || 0;
    let width = data.width || data.radius * 2 || 100;
    let height = data.height || data.radius * 2 || 100;

    return {
      left,
      top,
      right: left + width,
      bottom: top + height,
    };
  }

  /**
   * Transform a pair of operations
   */
  private transformOperationPair(
    op1: Operation,
    op2: Operation
  ): { op1: Operation; op2: Operation } {
    // Handle different operation type combinations
    if (op1.type === 'add' && op2.type === 'add') {
      return this.transformAddAdd(op1, op2);
    } else if (op1.type === 'update' && op2.type === 'update') {
      return this.transformUpdateUpdate(op1, op2);
    } else if (op1.type === 'delete' && op2.type === 'update') {
      return this.transformDeleteUpdate(op1, op2);
    } else if (op1.type === 'update' && op2.type === 'delete') {
      return this.transformUpdateDelete(op1, op2);
    } else if (op1.type === 'delete' && op2.type === 'delete') {
      return this.transformDeleteDelete(op1, op2);
    } else if (op1.type === 'transform' || op2.type === 'transform') {
      return this.transformTransformOp(op1, op2);
    }

    // Default: no transformation needed
    return { op1, op2 };
  }

  /**
   * Transform two add operations
   */
  private transformAddAdd(op1: Operation, op2: Operation): { op1: Operation; op2: Operation } {
    // If both operations add objects at the same position, offset one of them
    if (
      op1.data.left === op2.data.left &&
      op1.data.top === op2.data.top
    ) {
      const transformedOp1 = {
        ...op1,
        data: {
          ...op1.data,
          left: op1.data.left + 10,
          top: op1.data.top + 10,
        },
      };
      return { op1: transformedOp1, op2 };
    }

    return { op1, op2 };
  }

  /**
   * Transform two update operations
   */
  private transformUpdateUpdate(op1: Operation, op2: Operation): { op1: Operation; op2: Operation } {
    if (op1.objectId !== op2.objectId) {
      return { op1, op2 };
    }

    // Merge conflicting updates based on operation precedence
    const precedence = this.getOperationPrecedence(op1, op2);
    
    if (precedence > 0) {
      // op1 has higher precedence
      return { op1, op2: this.nullifyOperation(op2) };
    } else if (precedence < 0) {
      // op2 has higher precedence
      return { op1: this.nullifyOperation(op1), op2 };
    } else {
      // Same precedence, merge operations
      const mergedData = this.mergeOperationData(op1.data, op2.data);
      const mergedOp1 = { ...op1, data: mergedData };
      return { op1: mergedOp1, op2: this.nullifyOperation(op2) };
    }
  }

  /**
   * Transform delete and update operations
   */
  private transformDeleteUpdate(op1: Operation, op2: Operation): { op1: Operation; op2: Operation } {
    if (op1.objectId === op2.objectId) {
      // Delete takes precedence over update
      return { op1, op2: this.nullifyOperation(op2) };
    }
    return { op1, op2 };
  }

  /**
   * Transform update and delete operations
   */
  private transformUpdateDelete(op1: Operation, op2: Operation): { op1: Operation; op2: Operation } {
    if (op1.objectId === op2.objectId) {
      // Delete takes precedence over update
      return { op1: this.nullifyOperation(op1), op2 };
    }
    return { op1, op2 };
  }

  /**
   * Transform two delete operations
   */
  private transformDeleteDelete(op1: Operation, op2: Operation): { op1: Operation; op2: Operation } {
    if (op1.objectId === op2.objectId) {
      // Only keep one delete operation
      return { op1, op2: this.nullifyOperation(op2) };
    }
    return { op1, op2 };
  }

  /**
   * Transform operations involving transform type
   */
  private transformTransformOp(op1: Operation, op2: Operation): { op1: Operation; op2: Operation } {
    // Handle transform operations (like move, scale, rotate)
    if (op1.objectId !== op2.objectId) {
      return { op1, op2 };
    }

    // Apply both transformations in order
    const combinedTransform = this.combineTransforms(op1.data, op2.data);
    const transformedOp1 = { ...op1, data: combinedTransform };
    
    return { op1: transformedOp1, op2: this.nullifyOperation(op2) };
  }

  /**
   * Get operation precedence for conflict resolution
   */
  private getOperationPrecedence(op1: Operation, op2: Operation): number {
    // Higher version number wins
    if (op1.version !== op2.version) {
      return op1.version - op2.version;
    }

    // Earlier timestamp wins
    if (op1.timestamp !== op2.timestamp) {
      return op2.timestamp - op1.timestamp;
    }

    // User ID as tiebreaker
    return op1.userId.localeCompare(op2.userId);
  }

  /**
   * Merge operation data for conflicting updates
   */
  private mergeOperationData(data1: any, data2: any): any {
    const merged = { ...data1 };

    // Merge specific properties with conflict resolution rules
    Object.keys(data2).forEach(key => {
      switch (key) {
        case 'left':
        case 'top':
          // Take the average position for positioning conflicts
          merged[key] = (data1[key] + data2[key]) / 2;
          break;
        case 'width':
        case 'height':
          // Take the larger dimension
          merged[key] = Math.max(data1[key] || 0, data2[key] || 0);
          break;
        case 'fill':
        case 'stroke':
          // Take the most recent color change
          merged[key] = data2[key];
          break;
        case 'text':
          // Merge text content
          merged[key] = this.mergeText(data1[key] || '', data2[key] || '');
          break;
        default:
          // Default: take the newer value
          merged[key] = data2[key];
      }
    });

    return merged;
  }

  /**
   * Merge text content
   */
  private mergeText(text1: string, text2: string): string {
    if (text1 === text2) return text1;
    
    // Simple merge: concatenate with separator if both have content
    if (text1 && text2) {
      return `${text1} | ${text2}`;
    }
    
    return text1 || text2;
  }

  /**
   * Combine transform operations
   */
  private combineTransforms(transform1: any, transform2: any): any {
    return {
      ...transform1,
      ...transform2,
      // Combine transformations appropriately
      scaleX: (transform1.scaleX || 1) * (transform2.scaleX || 1),
      scaleY: (transform1.scaleY || 1) * (transform2.scaleY || 1),
      angle: (transform1.angle || 0) + (transform2.angle || 0),
    };
  }

  /**
   * Create a nullified operation (no-op)
   */
  private nullifyOperation(op: Operation): Operation {
    return {
      ...op,
      type: 'update', // Convert to harmless update
      data: {}, // Empty data means no change
    };
  }

  /**
   * Add operation to history
   */
  public addToHistory(operation: Operation) {
    this.operationHistory.push(operation);
    this.updateVectorClock(operation.userId, operation.timestamp);
    
    // Keep history size manageable
    if (this.operationHistory.length > 1000) {
      this.operationHistory = this.operationHistory.slice(500);
    }
  }

  /**
   * Update vector clock for causality tracking
   */
  private updateVectorClock(userId: string, timestamp: number) {
    const currentTime = this.vectorClock.get(userId) || 0;
    this.vectorClock.set(userId, Math.max(currentTime, timestamp));
  }

  /**
   * Get operations that happened after a certain point
   */
  public getOperationsSince(timestamp: number, userId?: string): Operation[] {
    return this.operationHistory.filter(op => {
      if (userId && op.userId === userId) return false;
      return op.timestamp > timestamp;
    });
  }

  /**
   * Check if an operation can be applied
   */
  public canApplyOperation(operation: Operation): boolean {
    // Check if the operation is already in history
    const exists = this.operationHistory.some(op => 
      op.id === operation.id || 
      (op.objectId === operation.objectId && 
       op.userId === operation.userId && 
       op.timestamp === operation.timestamp)
    );

    return !exists;
  }

  /**
   * Resolve conflicts for a batch of operations
   */
  public resolveBatch(operations: Operation[]): Operation[] {
    const resolved: Operation[] = [];
    
    operations.sort((a, b) => a.timestamp - b.timestamp);
    
    for (const op of operations) {
      if (this.canApplyOperation(op)) {
        const result = this.transformOperation(op, resolved);
        resolved.push(result.operation);
        resolved.push(...result.transformedOps);
        this.addToHistory(result.operation);
      }
    }
    
    return resolved;
  }

  /**
   * Clear history (useful for reset/sync)
   */
  public clearHistory() {
    this.operationHistory = [];
    this.vectorClock.clear();
  }

  /**
   * Get current state summary
   */
  public getStateSummary() {
    return {
      operationCount: this.operationHistory.length,
      vectorClock: Object.fromEntries(this.vectorClock),
      lastOperation: this.operationHistory[this.operationHistory.length - 1],
    };
  }
}

// Global instance
let otManager: OperationalTransform | null = null;

export const getOTManager = (): OperationalTransform => {
  if (!otManager) {
    otManager = new OperationalTransform();
  }
  return otManager;
};