--
-- PostgreSQL database dump
--

\restrict kHiFm3lsTJoxOPPcHBO7paO1pa0Xax0um0dLywQogtM7BzKIKOMdfblF7ZBrMec

-- Dumped from database version 15.3 (Ubuntu 15.3-1.pgdg22.04+1)
-- Dumped by pg_dump version 18.0

-- Started on 2025-12-20 01:08:20

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 216 (class 1259 OID 71019)
-- Name: Orgs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Orgs" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "Name" character varying(200) NOT NULL,
    "SettingsJson" jsonb,
    "CreatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL,
    "UpdatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL,
    "Description" text,
    "IsPublic" boolean DEFAULT false,
    "AllowCrossTreeLinking" boolean DEFAULT true,
    "CoverImageUrl" character varying(500),
    "OwnerId" bigint,
    "TownId" uuid
);


ALTER TABLE public."Orgs" OWNER TO postgres;

--
-- TOC entry 224 (class 1259 OID 71183)
-- Name: ParentChildren; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."ParentChildren" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "ParentId" uuid NOT NULL,
    "ChildId" uuid NOT NULL,
    "RelationshipType" integer DEFAULT 0 NOT NULL,
    "Certainty" character varying(50),
    "Notes" text,
    "CreatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL
);


ALTER TABLE public."ParentChildren" OWNER TO postgres;

--
-- TOC entry 3654 (class 0 OID 0)
-- Dependencies: 224
-- Name: TABLE "ParentChildren"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public."ParentChildren" IS 'Parent-child relationships with cycle detection logic in application';


--
-- TOC entry 220 (class 1259 OID 71084)
-- Name: People; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."People" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "OrgId" uuid NOT NULL,
    "PrimaryName" character varying(200),
    "Sex" integer DEFAULT 2 NOT NULL,
    "Gender" character varying(50),
    "BirthDate" timestamp without time zone,
    "BirthPrecision" integer DEFAULT 5 NOT NULL,
    "BirthPlaceId" uuid,
    "DeathDate" timestamp without time zone,
    "DeathPrecision" integer DEFAULT 5 NOT NULL,
    "DeathPlaceId" uuid,
    "PrivacyLevel" integer DEFAULT 1 NOT NULL,
    "Occupation" text,
    "Education" text,
    "Religion" text,
    "Nationality" text,
    "Ethnicity" text,
    "Notes" text,
    "SearchVector" tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, (((((COALESCE("PrimaryName", ''::character varying))::text || ' '::text) || COALESCE("Occupation", ''::text)) || ' '::text) || COALESCE("Notes", ''::text)))) STORED,
    "IsVerified" boolean DEFAULT false NOT NULL,
    "NeedsReview" boolean DEFAULT false NOT NULL,
    "HasConflict" boolean DEFAULT false NOT NULL,
    "CreatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL,
    "UpdatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL
);


ALTER TABLE public."People" OWNER TO postgres;

--
-- TOC entry 3655 (class 0 OID 0)
-- Dependencies: 220
-- Name: TABLE "People"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public."People" IS 'Core genealogy entity with multi-tenant support';


--
-- TOC entry 3656 (class 0 OID 0)
-- Dependencies: 220
-- Name: COLUMN "People"."SearchVector"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."People"."SearchVector" IS 'Auto-generated tsvector for full-text search';


--
-- TOC entry 249 (class 1259 OID 72605)
-- Name: PersonLinks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."PersonLinks" (
    "Id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "SourcePersonId" uuid NOT NULL,
    "TargetPersonId" uuid NOT NULL,
    "LinkType" integer DEFAULT 0 NOT NULL,
    "Confidence" integer DEFAULT 100,
    "Notes" text,
    "CreatedByUserId" bigint,
    "ApprovedByUserId" bigint,
    "Status" integer DEFAULT 0 NOT NULL,
    "CreatedAt" timestamp with time zone DEFAULT now(),
    "UpdatedAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT "CK_PersonLinks_Different" CHECK (("SourcePersonId" <> "TargetPersonId"))
);


ALTER TABLE public."PersonLinks" OWNER TO postgres;

--
-- TOC entry 252 (class 1259 OID 72698)
-- Name: PersonMedia; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."PersonMedia" (
    "Id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "PersonId" uuid NOT NULL,
    "MediaId" uuid NOT NULL,
    "IsPrimary" boolean DEFAULT false,
    "SortOrder" integer DEFAULT 0,
    "Notes" text,
    "CreatedAt" timestamp with time zone DEFAULT now(),
    "LinkedAt" timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public."PersonMedia" OWNER TO postgres;

--
-- TOC entry 3657 (class 0 OID 0)
-- Dependencies: 252
-- Name: TABLE "PersonMedia"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public."PersonMedia" IS 'Junction table linking Media to People (many-to-many). A single media file can be linked to multiple persons.';


--
-- TOC entry 3658 (class 0 OID 0)
-- Dependencies: 252
-- Name: COLUMN "PersonMedia"."Id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."PersonMedia"."Id" IS 'Primary key (UUID)';


--
-- TOC entry 3659 (class 0 OID 0)
-- Dependencies: 252
-- Name: COLUMN "PersonMedia"."PersonId"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."PersonMedia"."PersonId" IS 'Foreign key to People table';


--
-- TOC entry 3660 (class 0 OID 0)
-- Dependencies: 252
-- Name: COLUMN "PersonMedia"."MediaId"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."PersonMedia"."MediaId" IS 'Foreign key to MediaFiles table';


--
-- TOC entry 3661 (class 0 OID 0)
-- Dependencies: 252
-- Name: COLUMN "PersonMedia"."IsPrimary"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."PersonMedia"."IsPrimary" IS 'True if this is the primary/profile photo for this person';


--
-- TOC entry 3662 (class 0 OID 0)
-- Dependencies: 252
-- Name: COLUMN "PersonMedia"."SortOrder"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."PersonMedia"."SortOrder" IS 'Display order when showing person media';


--
-- TOC entry 3663 (class 0 OID 0)
-- Dependencies: 252
-- Name: COLUMN "PersonMedia"."Notes"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."PersonMedia"."Notes" IS 'Notes about this person in the media (e.g., position in group photo)';


--
-- TOC entry 3664 (class 0 OID 0)
-- Dependencies: 252
-- Name: COLUMN "PersonMedia"."LinkedAt"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public."PersonMedia"."LinkedAt" IS 'Timestamp when this person was linked to this media';


--
-- TOC entry 221 (class 1259 OID 71120)
-- Name: PersonNames; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."PersonNames" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "PersonId" uuid NOT NULL,
    "Script" character varying(10) DEFAULT 'Latin'::character varying NOT NULL,
    "Given" character varying(100),
    "Middle" character varying(100),
    "Family" character varying(100),
    "Full" character varying(300),
    "Transliteration" character varying(300),
    "Type" integer DEFAULT 0 NOT NULL,
    "CreatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL
);


ALTER TABLE public."PersonNames" OWNER TO postgres;

--
-- TOC entry 3665 (class 0 OID 0)
-- Dependencies: 221
-- Name: TABLE "PersonNames"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public."PersonNames" IS 'Supports multi-script names (Latin, Arabic, Nobiin)';


--
-- TOC entry 228 (class 1259 OID 71250)
-- Name: PersonTags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."PersonTags" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "PersonId" uuid NOT NULL,
    "TagId" uuid NOT NULL,
    "CreatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL
);


ALTER TABLE public."PersonTags" OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 71063)
-- Name: Places; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Places" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "OrgId" uuid NOT NULL,
    "Name" character varying(200) NOT NULL,
    "Type" character varying(50),
    "ParentId" uuid,
    "Latitude" double precision,
    "Longitude" double precision,
    "AltNamesJson" jsonb,
    "CreatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL
);


ALTER TABLE public."Places" OWNER TO postgres;

--
-- TOC entry 243 (class 1259 OID 72421)
-- Name: RefreshToken; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."RefreshToken" (
    "IssuedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "ExpiresAt" timestamp with time zone NOT NULL,
    "IsRevoked" boolean DEFAULT false NOT NULL,
    "RevokedAt" timestamp with time zone,
    "Value" text NOT NULL,
    "Id" bigint NOT NULL,
    "UserId" bigint NOT NULL
);


ALTER TABLE public."RefreshToken" OWNER TO postgres;

--
-- TOC entry 244 (class 1259 OID 72428)
-- Name: RefreshToken_Id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public."RefreshToken" ALTER COLUMN "Id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."RefreshToken_Id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 247 (class 1259 OID 72437)
-- Name: SignerToken; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."SignerToken" (
    "IssuedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "ExpiresAt" timestamp with time zone NOT NULL,
    "IsRevoked" boolean DEFAULT false NOT NULL,
    "RevokedAt" timestamp with time zone,
    "Value" text NOT NULL,
    "IsUsed" boolean DEFAULT false NOT NULL,
    "UsedAt" timestamp with time zone,
    "IssuedTo" text NOT NULL,
    "IssuedForDocumentId" integer NOT NULL,
    "Id" bigint NOT NULL,
    "RecipientEmail" text NOT NULL,
    "IssuedToId" integer DEFAULT 0 NOT NULL,
    "Passcode" integer DEFAULT 0 NOT NULL
);


ALTER TABLE public."SignerToken" OWNER TO postgres;

--
-- TOC entry 248 (class 1259 OID 72447)
-- Name: SignerToken_Id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public."SignerToken" ALTER COLUMN "Id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."SignerToken_Id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 226 (class 1259 OID 71230)
-- Name: Sources; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Sources" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "OrgId" uuid NOT NULL,
    "Title" character varying(300) NOT NULL,
    "Repository" character varying(200),
    "Citation" text,
    "Url" character varying(500),
    "MetadataJson" jsonb,
    "CreatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL,
    "UpdatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL
);


ALTER TABLE public."Sources" OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 71242)
-- Name: Tags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Tags" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "OrgId" uuid NOT NULL,
    "Name" character varying(100) NOT NULL,
    "Color" character varying(50),
    "CreatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL
);


ALTER TABLE public."Tags" OWNER TO postgres;

--
-- TOC entry 254 (class 1259 OID 72813)
-- Name: Towns; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Towns" (
    "Id" uuid NOT NULL,
    "Name" character varying(200) NOT NULL,
    "NameEn" character varying(200),
    "NameAr" character varying(200),
    "NameLocal" character varying(200),
    "Description" text,
    "Country" character varying(100),
    "CreatedAt" timestamp without time zone NOT NULL,
    "UpdatedAt" timestamp without time zone NOT NULL
);


ALTER TABLE public."Towns" OWNER TO postgres;

--
-- TOC entry 251 (class 1259 OID 72670)
-- Name: TreeInvitations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."TreeInvitations" (
    "Id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "TreeId" uuid NOT NULL,
    "Email" character varying(256) NOT NULL,
    "Role" integer DEFAULT 0 NOT NULL,
    "Token" character varying(100) NOT NULL,
    "InvitedByUserId" bigint NOT NULL,
    "ExpiresAt" timestamp with time zone NOT NULL,
    "AcceptedAt" timestamp with time zone,
    "AcceptedByUserId" bigint,
    "CreatedAt" timestamp with time zone DEFAULT now()
);


ALTER TABLE public."TreeInvitations" OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 71164)
-- Name: UnionMembers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."UnionMembers" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "UnionId" uuid NOT NULL,
    "PersonId" uuid NOT NULL,
    "Role" character varying(50) DEFAULT 'Spouse'::character varying NOT NULL,
    "CreatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL
);


ALTER TABLE public."UnionMembers" OWNER TO postgres;

--
-- TOC entry 3666 (class 0 OID 0)
-- Dependencies: 223
-- Name: TABLE "UnionMembers"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public."UnionMembers" IS 'Junction table supporting polygamy (multiple spouses per union)';


--
-- TOC entry 222 (class 1259 OID 71140)
-- Name: Unions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Unions" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "OrgId" uuid NOT NULL,
    "Type" integer DEFAULT 0 NOT NULL,
    "StartDate" timestamp without time zone,
    "StartPrecision" integer DEFAULT 5 NOT NULL,
    "StartPlaceId" uuid,
    "EndDate" timestamp without time zone,
    "EndPrecision" integer DEFAULT 5 NOT NULL,
    "EndPlaceId" uuid,
    "Notes" text,
    "CreatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL,
    "UpdatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL
);


ALTER TABLE public."Unions" OWNER TO postgres;

--
-- TOC entry 217 (class 1259 OID 71030)
-- Name: Users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Users" (
    "Id" uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "Email" character varying(256) NOT NULL,
    "PasswordHash" text NOT NULL,
    "FirstName" character varying(100),
    "LastName" character varying(100),
    "EmailConfirmed" boolean DEFAULT false NOT NULL,
    "CreatedAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL,
    "LastLoginAt" timestamp without time zone DEFAULT (now() AT TIME ZONE 'UTC'::text) NOT NULL,
    "RefreshToken" text,
    "RefreshTokenExpiryTime" timestamp without time zone
);


ALTER TABLE public."Users" OWNER TO postgres;

--
-- TOC entry 3408 (class 2606 OID 71028)
-- Name: Orgs Orgs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Orgs"
    ADD CONSTRAINT "Orgs_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3451 (class 2606 OID 72467)
-- Name: RefreshToken PK_RefreshToken; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."RefreshToken"
    ADD CONSTRAINT "PK_RefreshToken" PRIMARY KEY ("Id");


--
-- TOC entry 3455 (class 2606 OID 72471)
-- Name: SignerToken PK_SignerToken; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SignerToken"
    ADD CONSTRAINT "PK_SignerToken" PRIMARY KEY ("Id");


--
-- TOC entry 3481 (class 2606 OID 72819)
-- Name: Towns PK_Towns; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Towns"
    ADD CONSTRAINT "PK_Towns" PRIMARY KEY ("Id");


--
-- TOC entry 3439 (class 2606 OID 71192)
-- Name: ParentChildren ParentChildren_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ParentChildren"
    ADD CONSTRAINT "ParentChildren_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3422 (class 2606 OID 71101)
-- Name: People People_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."People"
    ADD CONSTRAINT "People_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3461 (class 2606 OID 72618)
-- Name: PersonLinks PersonLinks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonLinks"
    ADD CONSTRAINT "PersonLinks_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3475 (class 2606 OID 72708)
-- Name: PersonMedia PersonMedia_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonMedia"
    ADD CONSTRAINT "PersonMedia_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3428 (class 2606 OID 71130)
-- Name: PersonNames PersonNames_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonNames"
    ADD CONSTRAINT "PersonNames_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3449 (class 2606 OID 71256)
-- Name: PersonTags PersonTags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonTags"
    ADD CONSTRAINT "PersonTags_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3417 (class 2606 OID 71071)
-- Name: Places Places_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Places"
    ADD CONSTRAINT "Places_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3443 (class 2606 OID 71239)
-- Name: Sources Sources_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Sources"
    ADD CONSTRAINT "Sources_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3446 (class 2606 OID 71248)
-- Name: Tags Tags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Tags"
    ADD CONSTRAINT "Tags_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3468 (class 2606 OID 72679)
-- Name: TreeInvitations TreeInvitations_Token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TreeInvitations"
    ADD CONSTRAINT "TreeInvitations_Token_key" UNIQUE ("Token");


--
-- TOC entry 3470 (class 2606 OID 72677)
-- Name: TreeInvitations TreeInvitations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TreeInvitations"
    ADD CONSTRAINT "TreeInvitations_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3463 (class 2606 OID 72620)
-- Name: PersonLinks UQ_PersonLinks_Source_Target; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonLinks"
    ADD CONSTRAINT "UQ_PersonLinks_Source_Target" UNIQUE ("SourcePersonId", "TargetPersonId");


--
-- TOC entry 3477 (class 2606 OID 72710)
-- Name: PersonMedia UQ_PersonMedia_Person_Media; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonMedia"
    ADD CONSTRAINT "UQ_PersonMedia_Person_Media" UNIQUE ("PersonId", "MediaId");


--
-- TOC entry 3434 (class 2606 OID 71171)
-- Name: UnionMembers UnionMembers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."UnionMembers"
    ADD CONSTRAINT "UnionMembers_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3431 (class 2606 OID 71152)
-- Name: Unions Unions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Unions"
    ADD CONSTRAINT "Unions_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3411 (class 2606 OID 71042)
-- Name: Users Users_Email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Users"
    ADD CONSTRAINT "Users_Email_key" UNIQUE ("Email");


--
-- TOC entry 3413 (class 2606 OID 71040)
-- Name: Users Users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Users"
    ADD CONSTRAINT "Users_pkey" PRIMARY KEY ("Id");


--
-- TOC entry 3403 (class 1259 OID 72604)
-- Name: IX_Orgs_IsPublic; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Orgs_IsPublic" ON public."Orgs" USING btree ("IsPublic");


--
-- TOC entry 3404 (class 1259 OID 71029)
-- Name: IX_Orgs_Name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Orgs_Name" ON public."Orgs" USING btree ("Name");


--
-- TOC entry 3405 (class 1259 OID 72603)
-- Name: IX_Orgs_OwnerId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Orgs_OwnerId" ON public."Orgs" USING btree ("OwnerId");


--
-- TOC entry 3406 (class 1259 OID 72822)
-- Name: IX_Orgs_TownId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Orgs_TownId" ON public."Orgs" USING btree ("TownId");


--
-- TOC entry 3435 (class 1259 OID 71204)
-- Name: IX_ParentChildren_ChildId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_ParentChildren_ChildId" ON public."ParentChildren" USING btree ("ChildId");


--
-- TOC entry 3436 (class 1259 OID 71203)
-- Name: IX_ParentChildren_ParentId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_ParentChildren_ParentId" ON public."ParentChildren" USING btree ("ParentId");


--
-- TOC entry 3437 (class 1259 OID 71205)
-- Name: IX_ParentChildren_ParentId_ChildId_Type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IX_ParentChildren_ParentId_ChildId_Type" ON public."ParentChildren" USING btree ("ParentId", "ChildId", "RelationshipType");


--
-- TOC entry 3418 (class 1259 OID 71117)
-- Name: IX_People_OrgId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_People_OrgId" ON public."People" USING btree ("OrgId");


--
-- TOC entry 3419 (class 1259 OID 71118)
-- Name: IX_People_PrimaryName; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_People_PrimaryName" ON public."People" USING btree ("PrimaryName");


--
-- TOC entry 3420 (class 1259 OID 71119)
-- Name: IX_People_SearchVector; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_People_SearchVector" ON public."People" USING gin ("SearchVector");


--
-- TOC entry 3457 (class 1259 OID 72641)
-- Name: IX_PersonLinks_SourcePersonId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonLinks_SourcePersonId" ON public."PersonLinks" USING btree ("SourcePersonId");


--
-- TOC entry 3458 (class 1259 OID 72643)
-- Name: IX_PersonLinks_Status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonLinks_Status" ON public."PersonLinks" USING btree ("Status");


--
-- TOC entry 3459 (class 1259 OID 72642)
-- Name: IX_PersonLinks_TargetPersonId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonLinks_TargetPersonId" ON public."PersonLinks" USING btree ("TargetPersonId");


--
-- TOC entry 3471 (class 1259 OID 72722)
-- Name: IX_PersonMedia_MediaId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonMedia_MediaId" ON public."PersonMedia" USING btree ("MediaId");


--
-- TOC entry 3472 (class 1259 OID 72721)
-- Name: IX_PersonMedia_PersonId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonMedia_PersonId" ON public."PersonMedia" USING btree ("PersonId");


--
-- TOC entry 3473 (class 1259 OID 72894)
-- Name: IX_PersonMedia_PersonId_MediaId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IX_PersonMedia_PersonId_MediaId" ON public."PersonMedia" USING btree ("PersonId", "MediaId");


--
-- TOC entry 3423 (class 1259 OID 71139)
-- Name: IX_PersonNames_Family; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonNames_Family" ON public."PersonNames" USING gin ("Family" public.gin_trgm_ops);


--
-- TOC entry 3424 (class 1259 OID 71137)
-- Name: IX_PersonNames_Full; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonNames_Full" ON public."PersonNames" USING gin ("Full" public.gin_trgm_ops);


--
-- TOC entry 3425 (class 1259 OID 71138)
-- Name: IX_PersonNames_Given; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonNames_Given" ON public."PersonNames" USING gin ("Given" public.gin_trgm_ops);


--
-- TOC entry 3426 (class 1259 OID 71136)
-- Name: IX_PersonNames_PersonId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_PersonNames_PersonId" ON public."PersonNames" USING btree ("PersonId");


--
-- TOC entry 3447 (class 1259 OID 71267)
-- Name: IX_PersonTags_PersonId_TagId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IX_PersonTags_PersonId_TagId" ON public."PersonTags" USING btree ("PersonId", "TagId");


--
-- TOC entry 3414 (class 1259 OID 71082)
-- Name: IX_Places_OrgId_Name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Places_OrgId_Name" ON public."Places" USING btree ("OrgId", "Name");


--
-- TOC entry 3415 (class 1259 OID 71083)
-- Name: IX_Places_ParentId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Places_ParentId" ON public."Places" USING btree ("ParentId");


--
-- TOC entry 3440 (class 1259 OID 71240)
-- Name: IX_Sources_OrgId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Sources_OrgId" ON public."Sources" USING btree ("OrgId");


--
-- TOC entry 3441 (class 1259 OID 71241)
-- Name: IX_Sources_Title; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Sources_Title" ON public."Sources" USING btree ("Title");


--
-- TOC entry 3444 (class 1259 OID 71249)
-- Name: IX_Tags_OrgId_Name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IX_Tags_OrgId_Name" ON public."Tags" USING btree ("OrgId", "Name");


--
-- TOC entry 3478 (class 1259 OID 72821)
-- Name: IX_Towns_Country; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Towns_Country" ON public."Towns" USING btree ("Country");


--
-- TOC entry 3479 (class 1259 OID 72820)
-- Name: IX_Towns_Name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Towns_Name" ON public."Towns" USING btree ("Name");


--
-- TOC entry 3464 (class 1259 OID 72696)
-- Name: IX_TreeInvitations_Email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_TreeInvitations_Email" ON public."TreeInvitations" USING btree ("Email");


--
-- TOC entry 3465 (class 1259 OID 72697)
-- Name: IX_TreeInvitations_Token; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_TreeInvitations_Token" ON public."TreeInvitations" USING btree ("Token");


--
-- TOC entry 3466 (class 1259 OID 72695)
-- Name: IX_TreeInvitations_TreeId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_TreeInvitations_TreeId" ON public."TreeInvitations" USING btree ("TreeId");


--
-- TOC entry 3432 (class 1259 OID 71182)
-- Name: IX_UnionMembers_UnionId_PersonId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IX_UnionMembers_UnionId_PersonId" ON public."UnionMembers" USING btree ("UnionId", "PersonId");


--
-- TOC entry 3429 (class 1259 OID 71163)
-- Name: IX_Unions_OrgId; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IX_Unions_OrgId" ON public."Unions" USING btree ("OrgId");


--
-- TOC entry 3409 (class 1259 OID 71043)
-- Name: IX_Users_Email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IX_Users_Email" ON public."Users" USING btree ("Email");


--
-- TOC entry 3452 (class 1259 OID 72482)
-- Name: idx_refreshtoken_value; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_refreshtoken_value ON public."RefreshToken" USING btree ("Value");


--
-- TOC entry 3456 (class 1259 OID 72484)
-- Name: idx_signertoken_value; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_signertoken_value ON public."SignerToken" USING btree ("Value");


--
-- TOC entry 3453 (class 1259 OID 72483)
-- Name: refreshtoken_userid_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX refreshtoken_userid_idx ON public."RefreshToken" USING btree ("UserId");


--
-- TOC entry 3482 (class 2606 OID 72823)
-- Name: Orgs FK_Orgs_Towns_TownId; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Orgs"
    ADD CONSTRAINT "FK_Orgs_Towns_TownId" FOREIGN KEY ("TownId") REFERENCES public."Towns"("Id") ON DELETE SET NULL;


--
-- TOC entry 3494 (class 2606 OID 71198)
-- Name: ParentChildren FK_ParentChildren_Child; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ParentChildren"
    ADD CONSTRAINT "FK_ParentChildren_Child" FOREIGN KEY ("ChildId") REFERENCES public."People"("Id") ON DELETE RESTRICT;


--
-- TOC entry 3495 (class 2606 OID 71193)
-- Name: ParentChildren FK_ParentChildren_Parent; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ParentChildren"
    ADD CONSTRAINT "FK_ParentChildren_Parent" FOREIGN KEY ("ParentId") REFERENCES public."People"("Id") ON DELETE RESTRICT;


--
-- TOC entry 3486 (class 2606 OID 71107)
-- Name: People FK_People_BirthPlace; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."People"
    ADD CONSTRAINT "FK_People_BirthPlace" FOREIGN KEY ("BirthPlaceId") REFERENCES public."Places"("Id") ON DELETE SET NULL;


--
-- TOC entry 3487 (class 2606 OID 71112)
-- Name: People FK_People_DeathPlace; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."People"
    ADD CONSTRAINT "FK_People_DeathPlace" FOREIGN KEY ("DeathPlaceId") REFERENCES public."Places"("Id") ON DELETE SET NULL;


--
-- TOC entry 3488 (class 2606 OID 71102)
-- Name: People FK_People_Orgs; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."People"
    ADD CONSTRAINT "FK_People_Orgs" FOREIGN KEY ("OrgId") REFERENCES public."Orgs"("Id") ON DELETE CASCADE;


--
-- TOC entry 3489 (class 2606 OID 71131)
-- Name: PersonNames FK_PersonNames_People; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonNames"
    ADD CONSTRAINT "FK_PersonNames_People" FOREIGN KEY ("PersonId") REFERENCES public."People"("Id") ON DELETE CASCADE;


--
-- TOC entry 3496 (class 2606 OID 71257)
-- Name: PersonTags FK_PersonTags_People; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonTags"
    ADD CONSTRAINT "FK_PersonTags_People" FOREIGN KEY ("PersonId") REFERENCES public."People"("Id") ON DELETE CASCADE;


--
-- TOC entry 3497 (class 2606 OID 71262)
-- Name: PersonTags FK_PersonTags_Tags; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonTags"
    ADD CONSTRAINT "FK_PersonTags_Tags" FOREIGN KEY ("TagId") REFERENCES public."Tags"("Id") ON DELETE CASCADE;


--
-- TOC entry 3484 (class 2606 OID 71072)
-- Name: Places FK_Places_Orgs; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Places"
    ADD CONSTRAINT "FK_Places_Orgs" FOREIGN KEY ("OrgId") REFERENCES public."Orgs"("Id") ON DELETE CASCADE;


--
-- TOC entry 3485 (class 2606 OID 71077)
-- Name: Places FK_Places_ParentPlace; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Places"
    ADD CONSTRAINT "FK_Places_ParentPlace" FOREIGN KEY ("ParentId") REFERENCES public."Places"("Id") ON DELETE RESTRICT;


--
-- TOC entry 3492 (class 2606 OID 71177)
-- Name: UnionMembers FK_UnionMembers_People; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."UnionMembers"
    ADD CONSTRAINT "FK_UnionMembers_People" FOREIGN KEY ("PersonId") REFERENCES public."People"("Id") ON DELETE CASCADE;


--
-- TOC entry 3493 (class 2606 OID 71172)
-- Name: UnionMembers FK_UnionMembers_Unions; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."UnionMembers"
    ADD CONSTRAINT "FK_UnionMembers_Unions" FOREIGN KEY ("UnionId") REFERENCES public."Unions"("Id") ON DELETE CASCADE;


--
-- TOC entry 3490 (class 2606 OID 71158)
-- Name: Unions FK_Unions_EndPlace; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Unions"
    ADD CONSTRAINT "FK_Unions_EndPlace" FOREIGN KEY ("EndPlaceId") REFERENCES public."Places"("Id") ON DELETE SET NULL;


--
-- TOC entry 3491 (class 2606 OID 71153)
-- Name: Unions FK_Unions_StartPlace; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Unions"
    ADD CONSTRAINT "FK_Unions_StartPlace" FOREIGN KEY ("StartPlaceId") REFERENCES public."Places"("Id") ON DELETE SET NULL;


--
-- TOC entry 3483 (class 2606 OID 72598)
-- Name: Orgs Orgs_OwnerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Orgs"
    ADD CONSTRAINT "Orgs_OwnerId_fkey" FOREIGN KEY ("OwnerId") REFERENCES public."AspNetUsers"("Id") ON DELETE SET NULL;


--
-- TOC entry 3498 (class 2606 OID 72636)
-- Name: PersonLinks PersonLinks_ApprovedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonLinks"
    ADD CONSTRAINT "PersonLinks_ApprovedByUserId_fkey" FOREIGN KEY ("ApprovedByUserId") REFERENCES public."AspNetUsers"("Id") ON DELETE SET NULL;


--
-- TOC entry 3499 (class 2606 OID 72631)
-- Name: PersonLinks PersonLinks_CreatedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonLinks"
    ADD CONSTRAINT "PersonLinks_CreatedByUserId_fkey" FOREIGN KEY ("CreatedByUserId") REFERENCES public."AspNetUsers"("Id") ON DELETE SET NULL;


--
-- TOC entry 3500 (class 2606 OID 72621)
-- Name: PersonLinks PersonLinks_SourcePersonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonLinks"
    ADD CONSTRAINT "PersonLinks_SourcePersonId_fkey" FOREIGN KEY ("SourcePersonId") REFERENCES public."People"("Id") ON DELETE CASCADE;


--
-- TOC entry 3501 (class 2606 OID 72626)
-- Name: PersonLinks PersonLinks_TargetPersonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonLinks"
    ADD CONSTRAINT "PersonLinks_TargetPersonId_fkey" FOREIGN KEY ("TargetPersonId") REFERENCES public."People"("Id") ON DELETE CASCADE;


--
-- TOC entry 3505 (class 2606 OID 72716)
-- Name: PersonMedia PersonMedia_MediaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonMedia"
    ADD CONSTRAINT "PersonMedia_MediaId_fkey" FOREIGN KEY ("MediaId") REFERENCES public."MediaFiles"("Id") ON DELETE CASCADE;


--
-- TOC entry 3506 (class 2606 OID 72711)
-- Name: PersonMedia PersonMedia_PersonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PersonMedia"
    ADD CONSTRAINT "PersonMedia_PersonId_fkey" FOREIGN KEY ("PersonId") REFERENCES public."People"("Id") ON DELETE CASCADE;


--
-- TOC entry 3502 (class 2606 OID 72690)
-- Name: TreeInvitations TreeInvitations_AcceptedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TreeInvitations"
    ADD CONSTRAINT "TreeInvitations_AcceptedByUserId_fkey" FOREIGN KEY ("AcceptedByUserId") REFERENCES public."AspNetUsers"("Id") ON DELETE SET NULL;


--
-- TOC entry 3503 (class 2606 OID 72685)
-- Name: TreeInvitations TreeInvitations_InvitedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TreeInvitations"
    ADD CONSTRAINT "TreeInvitations_InvitedByUserId_fkey" FOREIGN KEY ("InvitedByUserId") REFERENCES public."AspNetUsers"("Id") ON DELETE CASCADE;


--
-- TOC entry 3504 (class 2606 OID 72680)
-- Name: TreeInvitations TreeInvitations_TreeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."TreeInvitations"
    ADD CONSTRAINT "TreeInvitations_TreeId_fkey" FOREIGN KEY ("TreeId") REFERENCES public."Orgs"("Id") ON DELETE CASCADE;


-- Completed on 2025-12-20 01:08:23

--
-- PostgreSQL database dump complete
--

\unrestrict kHiFm3lsTJoxOPPcHBO7paO1pa0Xax0um0dLywQogtM7BzKIKOMdfblF7ZBrMec

