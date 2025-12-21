-- Migration: Create AdminTownAssignments table for town-scoped admin access
-- This replaces tree-scoped assignments with town-scoped assignments
-- Admins are assigned to towns and can manage all trees within those towns

-- Create AdminTownAssignments table
CREATE TABLE IF NOT EXISTS public."AdminTownAssignments" (
    "Id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "UserId" bigint NOT NULL,
    "TownId" uuid NOT NULL,
    "AssignedByUserId" bigint,
    "AssignedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "IsActive" boolean DEFAULT true NOT NULL,
    CONSTRAINT "PK_AdminTownAssignments" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_AdminTownAssignments_User" FOREIGN KEY ("UserId")
        REFERENCES public."AspNetUsers"("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_AdminTownAssignments_Town" FOREIGN KEY ("TownId")
        REFERENCES public."Towns"("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_AdminTownAssignments_AssignedBy" FOREIGN KEY ("AssignedByUserId")
        REFERENCES public."AspNetUsers"("Id") ON DELETE SET NULL,
    CONSTRAINT "UQ_AdminTownAssignments_User_Town" UNIQUE ("UserId", "TownId")
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "IX_AdminTownAssignments_UserId"
    ON public."AdminTownAssignments" ("UserId");

CREATE INDEX IF NOT EXISTS "IX_AdminTownAssignments_TownId"
    ON public."AdminTownAssignments" ("TownId");

CREATE INDEX IF NOT EXISTS "IX_AdminTownAssignments_IsActive"
    ON public."AdminTownAssignments" ("IsActive");

-- Add comments
COMMENT ON TABLE public."AdminTownAssignments" IS
    'Assigns Admin-level users to manage specific towns and all trees within them';

COMMENT ON COLUMN public."AdminTownAssignments"."UserId" IS
    'The admin user being assigned to the town';

COMMENT ON COLUMN public."AdminTownAssignments"."TownId" IS
    'The town the admin can manage';

COMMENT ON COLUMN public."AdminTownAssignments"."AssignedByUserId" IS
    'SuperAdmin who made this assignment';

COMMENT ON COLUMN public."AdminTownAssignments"."IsActive" IS
    'Soft delete flag - inactive assignments are ignored';
