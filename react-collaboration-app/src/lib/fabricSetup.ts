import { FabricObject } from 'fabric';

/**
 * Collaboration metadata that must survive `toObject()` / `loadFromJSON()`
 * round-trips so remote peers can address the same object.
 */
FabricObject.customProperties = ['id', 'name', 'userId', 'version', 'lastModified'];
FabricObject.ownDefaults.objectCaching = true;

/**
 * Objects removed because a peer deleted them. Local "object:removed" handlers
 * skip these so remote deletions are not echoed back to the server.
 */
export const remotelyRemoved = new WeakSet<FabricObject>();
