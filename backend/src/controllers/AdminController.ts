// AdminController was deleted as part of CFR-008 remediation.
//
// This file previously contained dead code with destructive operations
// (moderateContent with ban_user, delete_venue actions) that had no route
// file connecting it. The risk was accidental re-connection without proper
// authentication and authorization middleware.
//
// If admin functionality is needed post-beta, it should be rebuilt with:
// 1. Proper route file with authenticateToken + requireAdmin() middleware
// 2. Zod validation schemas for all inputs
// 3. Comprehensive test coverage
// 4. Audit logging for all destructive operations
//
// See: docs/reviews/fix-plan.md Fix 6 (CFR-008)
