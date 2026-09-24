export { homeMembers, homes } from "@/db/schema";

export type HomeMemberDto = { id: string; displayName: string };
export type HomeDto = {
  id: string;
  name: string;
  startDate: string;
  version: number;
  members: HomeMemberDto[];
};
