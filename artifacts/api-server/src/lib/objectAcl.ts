import { readFile, stat, writeFile } from 'node:fs/promises';

import type { LocalObjectFile } from './objectStorage';

const ACL_POLICY_METADATA_KEY = 'aclPolicy';

export enum ObjectAccessGroupType {}

export interface ObjectAccessGroup {
  type: ObjectAccessGroupType;
  id: string;
}

export enum ObjectPermission {
  READ = 'read',
  WRITE = 'write',
}

export interface ObjectAclRule {
  group: ObjectAccessGroup;
  permission: ObjectPermission;
}

export interface ObjectAclPolicy {
  owner: string;
  visibility: 'public' | 'private';
  aclRules?: Array<ObjectAclRule>;
}

interface LocalMetadata {
  name?: string;
  size?: number;
  contentType?: string;
  aclPolicy?: ObjectAclPolicy;
  [key: string]: unknown;
}

function isPermissionAllowed(
  requested: ObjectPermission,
  granted: ObjectPermission,
): boolean {
  if (requested === ObjectPermission.READ) {
    return [
      ObjectPermission.READ,
      ObjectPermission.WRITE,
    ].includes(granted);
  }

  return granted === ObjectPermission.WRITE;
}

abstract class BaseObjectAccessGroup implements ObjectAccessGroup {
  constructor(
    public readonly type: ObjectAccessGroupType,
    public readonly id: string,
  ) {}

  public abstract hasMember(userId: string): Promise<boolean>;
}

function createObjectAccessGroup(
  group: ObjectAccessGroup,
): BaseObjectAccessGroup {
  switch (group.type) {
    default:
      throw new Error(`Unknown access group type: ${group.type}`);
  }
}

async function readMetadata(
  objectFile: LocalObjectFile,
): Promise<LocalMetadata> {
  try {
    const contents = await readFile(objectFile.metadataPath, 'utf8');
    return JSON.parse(contents) as LocalMetadata;
  } catch {
    return {};
  }
}

async function writeMetadata(
  objectFile: LocalObjectFile,
  metadata: LocalMetadata,
): Promise<void> {
  await writeFile(
    objectFile.metadataPath,
    JSON.stringify(metadata, null, 2),
    'utf8',
  );
}

export async function setObjectAclPolicy(
  objectFile: LocalObjectFile,
  aclPolicy: ObjectAclPolicy,
): Promise<void> {
  try {
    await stat(objectFile.path);
  } catch {
    throw new Error(`Object not found: ${objectFile.name}`);
  }

  const metadata = await readMetadata(objectFile);

  metadata[ACL_POLICY_METADATA_KEY] = aclPolicy;

  await writeMetadata(objectFile, metadata);
}

export async function getObjectAclPolicy(
  objectFile: LocalObjectFile,
): Promise<ObjectAclPolicy | null> {
  const metadata = await readMetadata(objectFile);

  const aclPolicy = metadata[ACL_POLICY_METADATA_KEY];

  if (!aclPolicy) {
    return null;
  }

  return aclPolicy as ObjectAclPolicy;
}

export async function canAccessObject({
  userId,
  objectFile,
  requestedPermission,
}: {
  userId?: string;
  objectFile: LocalObjectFile;
  requestedPermission: ObjectPermission;
}): Promise<boolean> {
  const aclPolicy = await getObjectAclPolicy(objectFile);

  if (!aclPolicy) {
    return false;
  }

  if (
    aclPolicy.visibility === 'public' &&
    requestedPermission === ObjectPermission.READ
  ) {
    return true;
  }

  if (!userId) {
    return false;
  }

  if (aclPolicy.owner === userId) {
    return true;
  }

  for (const rule of aclPolicy.aclRules || []) {
    const accessGroup = createObjectAccessGroup(rule.group);

    if (
      (await accessGroup.hasMember(userId)) &&
      isPermissionAllowed(requestedPermission, rule.permission)
    ) {
      return true;
    }
  }

  return false;
}
