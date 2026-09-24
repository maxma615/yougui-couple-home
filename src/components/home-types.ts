export type Member = {
  id: string;
  displayName: string;
};

export type User = Member & {
  email: string;
};

export type Home = {
  id: string;
  name: string;
  startDate: string;
  version: number;
  members: Member[];
};

export type SessionData = {
  user: User;
  home: Home | null;
};

export type AuditMember = Member | string | null;

export type AuditedRecord = {
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: AuditMember;
  updatedBy: AuditMember;
};

export type Anniversary = AuditedRecord & {
  id: string;
  title: string;
  date: string;
  note: string;
  yearly: boolean;
};

export type Todo = AuditedRecord & {
  id: string;
  title: string;
  description: string;
  assigneeId: string | null;
  dueDate: string | null;
  completed: boolean;
  completedAt: string | null;
};

export type MomentPhoto = {
  id: string;
  filename: string;
  mime: string;
  bytes: number;
};

export type Moment = AuditedRecord & {
  id: string;
  title: string;
  date: string;
  body: string;
  photos: MomentPhoto[];
};

export type ItemList<T> = { items: T[] };

