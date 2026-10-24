# Security Specification & Test Protocol

## 1. Data Invariants

1. **User Identity Isolation**: A user can only read, write, update, and delete documents within `/users/{userId}/**` where `request.auth.uid == userId`.
2. **Path Hardening**: All path IDs (`userId`, `plantId`, `logId`) must be valid alphanumeric strings of max length 128 matching `^[a-zA-Z0-9_\-]+$`.
3. **Data Integrity & Key Whitelisting**: Payloads must strictly adhere to allowed and required keys with strict type and boundary constraints.
4. **Child Document Consistency**: A log entry cannot be created without matching `userId` and `plantId` pointing to the owner and parent plant.
5. **Default Deny**: Any unmatched paths are completely blocked from read and write.

## 2. The "Dirty Dozen" Payloads (Attacks that MUST return PERMISSION_DENIED)

1. **Unauthenticated Read**: Attempt to read `/users/user123/plants/plant1` without authentication.
2. **Cross-Tenant Read**: User `attacker_uid` attempts to read `/users/victim_uid/plants/plant1`.
3. **Cross-Tenant Write**: User `attacker_uid` attempts to write to `/users/victim_uid/plants/plant1`.
4. **Ghost Field Poisoning**: Creating a plant with unexpected root property `"isAdmin": true`.
5. **Path ID Traversal/Poisoning**: Attempt to write with a 2000-character malicious path ID or invalid characters.
6. **Owner Spoofing**: User `user1` creates plant in `/users/user1/plants/p1` but sets `userId: "user2"`.
7. **Invalid Lifecycle Stage**: Attempt to write a plant with stage `"SuperSaiyan"`.
8. **Negative / Massive String Length**: Attempt to insert a 500KB string into plant `name`.
9. **Unauthenticated Log Injection**: Attempt to create a log entry without signing in.
10. **Cross-User Log Injection**: User `attacker_uid` attempts to write a log in `/users/victim_uid/plants/p1/logs/l1`.
11. **Mismatched Child PlantId**: Creating a log under `p1` with payload `plantId: "different_plant"`.
12. **Blanket Query Scraping**: Attempting an unscoped collection-group or unrestricted query across all users' plants.
