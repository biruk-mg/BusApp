--
-- PostgreSQL database dump
--

\restrict mIq795gg5vv1MFfE8WWUQ6s1hXzs7WSGvIbBaTJfysijPNfCdgWYC8hpWxnz5Bq

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

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

--
-- Name: BookingStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."BookingStatus" AS ENUM (
    'PENDING',
    'CONFIRMED',
    'CANCELLED',
    'COMPLETED'
);


ALTER TYPE public."BookingStatus" OWNER TO postgres;

--
-- Name: BusType; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."BusType" AS ENUM (
    'STANDARD',
    'LUXURY',
    'MINIBUS'
);


ALTER TYPE public."BusType" OWNER TO postgres;

--
-- Name: PaymentMethod; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."PaymentMethod" AS ENUM (
    'TELEBIRR',
    'CBE_BIRR',
    'CARD',
    'BANK_TRANSFER'
);


ALTER TYPE public."PaymentMethod" OWNER TO postgres;

--
-- Name: PaymentStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."PaymentStatus" AS ENUM (
    'PENDING',
    'SUCCESS',
    'FAILED'
);


ALTER TYPE public."PaymentStatus" OWNER TO postgres;

--
-- Name: Role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."Role" AS ENUM (
    'CUSTOMER',
    'OPERATOR',
    'DRIVER',
    'ADMIN'
);


ALTER TYPE public."Role" OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Booking; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Booking" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "scheduleId" text NOT NULL,
    "seatNumbers" text[],
    "totalPrice" double precision NOT NULL,
    status public."BookingStatus" DEFAULT 'PENDING'::public."BookingStatus" NOT NULL,
    "qrCode" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Booking" OWNER TO postgres;

--
-- Name: Bus; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Bus" (
    id text NOT NULL,
    "operatorId" text NOT NULL,
    "plateNumber" text NOT NULL,
    "totalSeats" integer NOT NULL,
    "busType" public."BusType" DEFAULT 'STANDARD'::public."BusType" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Bus" OWNER TO postgres;

--
-- Name: Operator; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Operator" (
    id text NOT NULL,
    "companyName" text NOT NULL,
    "licenseNo" text NOT NULL,
    phone text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Operator" OWNER TO postgres;

--
-- Name: Payment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Payment" (
    id text NOT NULL,
    "bookingId" text NOT NULL,
    amount double precision NOT NULL,
    method public."PaymentMethod" NOT NULL,
    "chapaRef" text,
    status public."PaymentStatus" DEFAULT 'PENDING'::public."PaymentStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Payment" OWNER TO postgres;

--
-- Name: Route; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Route" (
    id text NOT NULL,
    "fromCity" text NOT NULL,
    "toCity" text NOT NULL,
    "distanceKm" double precision NOT NULL,
    "estimatedDurationMin" integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Route" OWNER TO postgres;

--
-- Name: Schedule; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Schedule" (
    id text NOT NULL,
    "routeId" text NOT NULL,
    "busId" text NOT NULL,
    "departureTime" timestamp(3) without time zone NOT NULL,
    "arrivalTime" timestamp(3) without time zone NOT NULL,
    price double precision NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Schedule" OWNER TO postgres;

--
-- Name: User; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."User" (
    id text NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    email text,
    password text NOT NULL,
    role public."Role" DEFAULT 'CUSTOMER'::public."Role" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."User" OWNER TO postgres;

--
-- Data for Name: Booking; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Booking" (id, "userId", "scheduleId", "seatNumbers", "totalPrice", status, "qrCode", "createdAt", "updatedAt") FROM stdin;
cmoe0f91q0000cgkffpykorpb	op-test-001	cmoe0ecow0000mkkfex9tyb5p	{2C}	150	CONFIRMED	data:image/png;base64,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	2026-04-25 07:20:24.206	2026-04-25 07:20:24.206
cmoe0lcdp0001cgkf5utn1lb6	cmob982jr0001e4kfv6h96g2o	cmoe0ecp00001mkkfel1gjub6	{2D}	200	CONFIRMED	data:image/png;base64,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	2026-04-25 07:25:08.462	2026-04-25 07:25:08.462
cmoe0mx0y0002cgkf1ea4xzc5	cmob982jr0001e4kfv6h96g2o	cmoe0ecp00001mkkfel1gjub6	{3D}	200	CONFIRMED	data:image/png;base64,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	2026-04-25 07:26:21.874	2026-04-25 07:26:21.874
cmoe0namg0003cgkfvfwjo5iv	cmob982jr0001e4kfv6h96g2o	cmoe0ecp00001mkkfel1gjub6	{4A}	200	CONFIRMED	data:image/png;base64,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	2026-04-25 07:26:39.496	2026-04-25 07:26:39.496
cmoe0rhz30004cgkf9qhuo21w	cmob982jr0001e4kfv6h96g2o	cmoe0ecp00001mkkfel1gjub6	{5B}	200	CONFIRMED	data:image/png;base64,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	2026-04-25 07:29:55.647	2026-04-25 07:29:55.647
cmoe0s32t0005cgkfv2z0cw8h	cmob982jr0001e4kfv6h96g2o	cmoe0ecow0000mkkfex9tyb5p	{2D}	150	CONFIRMED	data:image/png;base64,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	2026-04-25 07:30:22.997	2026-04-25 07:30:22.997
cmovfq4f000006kkfheuta2rz	cmob982jr0001e4kfv6h96g2o	cmovf219x0000j4kfyag8tv3o	{4A}	150	CONFIRMED	data:image/png;base64,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	2026-05-07 12:00:50.652	2026-05-07 12:00:50.652
\.


--
-- Data for Name: Bus; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Bus" (id, "operatorId", "plateNumber", "totalSeats", "busType", "createdAt") FROM stdin;
cmob7k7ml0001p4kf8xoqpz41	cmob7k7lw0000p4kfjcejcphz	AA-12345	45	STANDARD	2026-04-23 08:16:54.429
cmob7k7my0002p4kf0b1ui4zc	cmob7k7lw0000p4kfjcejcphz	AA-67890	30	LUXURY	2026-04-23 08:16:54.442
cmovguaxo00026kkfxux8yuuj	cmob7k7lw0000p4kfjcejcphz	aa-21325	50	STANDARD	2026-05-07 12:32:05.34
cmp55n55k00048ckfgy5bczk0	cmob7k7lw0000p4kfjcejcphz	AA-22222	45	STANDARD	2026-05-14 07:16:17.241
\.


--
-- Data for Name: Operator; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Operator" (id, "companyName", "licenseNo", phone, "createdAt") FROM stdin;
cmob7k7lw0000p4kfjcejcphz	Selam Bus	ET-OP-001	0911000001	2026-04-23 08:16:54.405
\.


--
-- Data for Name: Payment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Payment" (id, "bookingId", amount, method, "chapaRef", status, "createdAt") FROM stdin;
cmoe1ql450000jwkf4a01ten1	cmoe0s32t0005cgkfv2z0cw8h	150	TELEBIRR	ETHIOBUS-cmoe0s32t0005cgkfv2z0cw8h-1777103829290	PENDING	2026-04-25 07:57:12.677
cmovfqdo700016kkf34hz8g6g	cmovfq4f000006kkfheuta2rz	150	TELEBIRR	ETHIOBUS-cmovfq4f000006kkfheuta2rz-1778155260234	PENDING	2026-05-07 12:01:02.647
\.


--
-- Data for Name: Route; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Route" (id, "fromCity", "toCity", "distanceKm", "estimatedDurationMin", "createdAt") FROM stdin;
cmob7k7n50003p4kfct0bmfv3	Addis Ababa	Adama	99	90	2026-04-23 08:16:54.449
cmob7k7n90004p4kfzsjsn0ax	Addis Ababa	Hawassa	275	270	2026-04-23 08:16:54.453
cmob7k7nb0005p4kf1xsgerfm	Addis Ababa	Bahir Dar	467	480	2026-04-23 08:16:54.455
cmob7k7nd0006p4kf06ad92e0	Addis Ababa	Dire Dawa	515	540	2026-04-23 08:16:54.457
cmob7k7nf0007p4kf0uuc1sci	Addis Ababa	Jimma	346	360	2026-04-23 08:16:54.459
cmob7k7ni0008p4kfj7691fei	Addis Ababa	Mekelle	783	780	2026-04-23 08:16:54.462
cmob7k7nk0009p4kfbu2mu4l4	Addis Ababa	Gondar	727	720	2026-04-23 08:16:54.464
cmob7k7nn000ap4kfjyrkn0rp	Hawassa	Addis Ababa	275	270	2026-04-23 08:16:54.467
cmob7k7nq000bp4kf483b9tbl	Adama	Addis Ababa	99	90	2026-04-23 08:16:54.47
cmowlxlut0009uskfnaybkfxp	Addis Ababa	Hossana	300	300	2026-05-08 07:42:23.717
\.


--
-- Data for Name: Schedule; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Schedule" (id, "routeId", "busId", "departureTime", "arrivalTime", price, "createdAt") FROM stdin;
cmoe0ecow0000mkkfex9tyb5p	cmob7k7n50003p4kfct0bmfv3	cmob7k7ml0001p4kf8xoqpz41	2026-04-26 03:00:00	2026-04-26 04:30:00	150	2026-04-25 07:19:42.272
cmoe0ecp00001mkkfel1gjub6	cmob7k7n50003p4kfct0bmfv3	cmob7k7my0002p4kf0b1ui4zc	2026-04-26 06:00:00	2026-04-26 07:30:00	200	2026-04-25 07:19:42.276
cmoe0ecp10002mkkfuetehfw2	cmob7k7n90004p4kfzsjsn0ax	cmob7k7ml0001p4kf8xoqpz41	2026-04-26 04:00:00	2026-04-26 08:30:00	350	2026-04-25 07:19:42.277
cmovf219x0000j4kfyag8tv3o	cmob7k7n50003p4kfct0bmfv3	cmob7k7ml0001p4kf8xoqpz41	2026-05-08 03:00:00	2026-05-08 04:30:00	150	2026-05-07 11:42:06.838
cmovf21ad0001j4kfqvtx4u2v	cmob7k7n50003p4kfct0bmfv3	cmob7k7my0002p4kf0b1ui4zc	2026-05-08 06:00:00	2026-05-08 07:30:00	200	2026-05-07 11:42:06.853
cmovf21ae0002j4kfxj834bfw	cmob7k7n90004p4kfzsjsn0ax	cmob7k7ml0001p4kf8xoqpz41	2026-05-08 04:00:00	2026-05-08 08:30:00	350	2026-05-07 11:42:06.854
cmovf21ag0003j4kfrbs91etb	cmob7k7nb0005p4kf1xsgerfm	cmob7k7my0002p4kf0b1ui4zc	2026-05-08 03:00:00	2026-05-08 11:00:00	550	2026-05-07 11:42:06.856
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."User" (id, name, phone, email, password, role, "createdAt", "updatedAt") FROM stdin;
cmob982jr0001e4kfv6h96g2o	BIRUK MUGORO	0916289368	birukmugoromg@gmail.com	$2b$12$jPOBCK5ElV1BtJTWYfPMo.E9MZGB292mvVqvns5WZFXItMZGsM1.G	CUSTOMER	2026-04-23 09:03:27.208	2026-04-23 09:03:27.208
cmo9ugftz0000hwkfhpbepnyd	Ruham	0912345678	\N	$2b$12$5ldbGPkTCaIOxljJulW0GuD98lCzoT4vbR/gDqQtRCQum9QqXSsXO	ADMIN	2026-04-22 09:22:17.256	2026-04-22 09:22:17.256
op-test-001	Selam Bus Manager	0911000001	\N	$2b$12$k7kHC0fXvvri57vJNCcMheeqhRGbAUUsCYSZVCKwkMGVp/L5LzenS	OPERATOR	2026-04-24 10:26:50.443	2026-04-24 10:26:50.443
\.


--
-- Name: Booking Booking_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Booking"
    ADD CONSTRAINT "Booking_pkey" PRIMARY KEY (id);


--
-- Name: Bus Bus_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Bus"
    ADD CONSTRAINT "Bus_pkey" PRIMARY KEY (id);


--
-- Name: Operator Operator_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Operator"
    ADD CONSTRAINT "Operator_pkey" PRIMARY KEY (id);


--
-- Name: Payment Payment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_pkey" PRIMARY KEY (id);


--
-- Name: Route Route_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Route"
    ADD CONSTRAINT "Route_pkey" PRIMARY KEY (id);


--
-- Name: Schedule Schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Schedule"
    ADD CONSTRAINT "Schedule_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: Booking_qrCode_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Booking_qrCode_key" ON public."Booking" USING btree ("qrCode");


--
-- Name: Bus_plateNumber_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Bus_plateNumber_key" ON public."Bus" USING btree ("plateNumber");


--
-- Name: Operator_licenseNo_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Operator_licenseNo_key" ON public."Operator" USING btree ("licenseNo");


--
-- Name: Payment_bookingId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Payment_bookingId_key" ON public."Payment" USING btree ("bookingId");


--
-- Name: Route_fromCity_toCity_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Route_fromCity_toCity_key" ON public."Route" USING btree ("fromCity", "toCity");


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: User_phone_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "User_phone_key" ON public."User" USING btree (phone);


--
-- Name: Booking Booking_scheduleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Booking"
    ADD CONSTRAINT "Booking_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES public."Schedule"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Booking Booking_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Booking"
    ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Bus Bus_operatorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Bus"
    ADD CONSTRAINT "Bus_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES public."Operator"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Payment Payment_bookingId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES public."Booking"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Schedule Schedule_busId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Schedule"
    ADD CONSTRAINT "Schedule_busId_fkey" FOREIGN KEY ("busId") REFERENCES public."Bus"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Schedule Schedule_routeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Schedule"
    ADD CONSTRAINT "Schedule_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES public."Route"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict mIq795gg5vv1MFfE8WWUQ6s1hXzs7WSGvIbBaTJfysijPNfCdgWYC8hpWxnz5Bq

