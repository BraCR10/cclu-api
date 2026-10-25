const mongoose = require('mongoose');
const { Member, APPLICATION_STATUSES } = require('../../models/Member');
const { Membership } = require('../../models/Membership');
const { Payment, PAYMENT_STATUSES } = require('../../models/Payment');
const { Vacancy, VACANCY_STATUSES } = require('../../models/Vacancy');
const { Subscriber, SUBSCRIBER_STATUSES } = require('../../models/Subscriber');
const {
  Publication,
  PUBLICATION_TYPES,
  PUBLICATION_STATUSES,
} = require('../../models/Publication');
const { PLAN_KEYS } = require('../../models/Plan');
const { ACCOUNT_STATUSES } = require('../../config/accountStatus');
const { formatMemberCode } = require('../memberCodeService');
const { isExpiredPaidPlan } = require('../entitlementService');
const { readNoticeDays } = require('../membershipPolicyService');
const { findPublishingMembers } = require('../jobBoardService');
const {
  formatDay,
  formatColones,
  MEMBER_TYPE_LABELS,
  ACCOUNT_STATUS_LABELS,
  WORKDAY_LABELS,
  FREQUENCY_LABELS,
  SUBSCRIBER_STATUS_LABELS,
  PUBLICATION_TYPE_LABELS,
} = require('./reportFormat');

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const SPANISH_ORDER = new Intl.Collator('es', { sensitivity: 'base' });
const FREE_PLAN_NAME = 'Gratuita';
const PAID_PLANS = [PLAN_KEYS.LITE, PLAN_KEYS.PRO, PLAN_KEYS.PREMIUM];

const objectId = (value) => new mongoose.Types.ObjectId(value);

const defaultReportStore = {
  findMembers: (filter) =>
    Member.find(filter)
      .select(
        'businessName memberCode memberType activity activityOther canton district accountStatus reviewedAt',
      )
      .populate('canton', 'name')
      .populate('activity', 'name')
      .lean(),
  findMemberships: (memberIds) =>
    Membership.find({ member: { $in: memberIds } })
      .populate('plan', 'key name')
      .lean(),
  findPayments: (filter) =>
    Payment.find(filter).populate('member', 'businessName memberCode canton district').lean(),
  findVacancies: (filter) =>
    Vacancy.find(filter).populate('member', 'businessName canton district').lean(),
  findPublications: (filter) =>
    Publication.find(filter)
      .populate('member', 'businessName memberCode canton district')
      .populate('category', 'name')
      .lean(),
  findSubscribers: (filter) => Subscriber.find(filter).populate('canton', 'name').lean(),
  readNoticeDays: () => readNoticeDays(),
  findPublishingMembers: (now) => findPublishingMembers(now),
};

function memberFilter(filters) {
  return {
    applicationStatus: APPLICATION_STATUSES.APPROVED,
    ...(filters.accountStatus === null ? {} : { accountStatus: filters.accountStatus }),
    ...(filters.memberType === null ? {} : { memberType: filters.memberType }),
    ...(filters.activity === null ? {} : { activity: objectId(filters.activity) }),
    ...(filters.canton === null ? {} : { canton: objectId(filters.canton) }),
    ...(filters.district === null ? {} : { district: filters.district }),
  };
}

function rangeFilter(field, filters) {
  if (filters.from === null && filters.to === null) {
    return {};
  }

  return {
    [field]: {
      ...(filters.from === null ? {} : { $gte: filters.from }),
      ...(filters.to === null ? {} : { $lte: filters.to }),
    },
  };
}

// Each member with the plan they hold right now: a paid plan whose term ran out
// already counts as Gratuita, before the hourly run moves the record.
async function loadMembers(filters, now, store) {
  const members = await store.findMembers(memberFilter(filters));
  const memberships = await store.findMemberships(members.map((member) => member._id));
  const byMember = new Map(memberships.map((entry) => [String(entry.member), entry]));

  return members
    .map((member) => {
      const membership = byMember.get(String(member._id));
      const paid =
        membership !== undefined &&
        membership.plan !== null &&
        membership.plan.key !== PLAN_KEYS.FREE &&
        !isExpiredPaidPlan(membership, now);

      return {
        ...member,
        planKey: paid ? membership.plan.key : PLAN_KEYS.FREE,
        planName: paid ? membership.plan.name : FREE_PLAN_NAME,
        expiresAt: paid ? membership.expiresAt : null,
      };
    })
    .filter((member) => filters.plan === null || member.planKey === filters.plan)
    .sort((first, second) => SPANISH_ORDER.compare(first.businessName, second.businessName));
}

const business = (member) => member.businessName;
const code = (member) => formatMemberCode(member.memberCode);
const activityOf = (member) => member.activity?.name ?? member.activityOther ?? '';

function countBy(rows, label, test) {
  return { label, value: String(rows.filter(test).length) };
}

const PLACE_FILTERS = ['canton', 'district'];
const MEMBER_FILTERS = [...PLACE_FILTERS, 'memberType', 'activity'];

// The publication reports ask the marketplace's question, the way the vacancies
// report asks the board's: active, not taken down, inside its validity, and
// offered by a business that still holds a plan that publishes. A lapse empties
// the report the same moment it empties the shop window.
async function loadVisiblePublications(filters, now, store, types) {
  const publishing = new Set((await store.findPublishingMembers(now)).map(String));
  const publications = await store.findPublications({
    type: { $in: types },
    status: PUBLICATION_STATUSES.ACTIVE,
    removedAt: null,
    ...rangeFilter('publishedAt', filters),
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  });

  return publications
    .filter(
      (publication) =>
        publication.member !== null &&
        publishing.has(String(publication.member._id)) &&
        (filters.canton === null || String(publication.member.canton) === filters.canton) &&
        (filters.district === null || publication.member.district === filters.district),
    )
    .sort((first, second) => second.publishedAt - first.publishedAt);
}

const categoryOf = (publication) => publication.category?.name ?? '';
const percentageOf = (publication) =>
  publication.percentage === null || publication.percentage === undefined
    ? ''
    : `${publication.percentage} %`;

const REPORTS = [
  {
    type: 'members',
    title: 'Comercios afiliados (todos)',
    filters: [...MEMBER_FILTERS, 'plan', 'accountStatus'],
    columns: ['Comercio', 'Código', 'Tipo', 'Actividad', 'Distrito', 'Plan', 'Estado de cuenta'],
    async load(filters, now, store) {
      const members = await loadMembers(filters, now, store);

      return {
        summary: [
          { label: 'Total', value: String(members.length) },
          countBy(
            members,
            'Activas',
            (member) => member.accountStatus !== ACCOUNT_STATUSES.SUSPENDED,
          ),
          countBy(
            members,
            'Suspendidas',
            (member) => member.accountStatus === ACCOUNT_STATUSES.SUSPENDED,
          ),
        ],
        rows: members.map((member) => [
          business(member),
          code(member),
          MEMBER_TYPE_LABELS[member.memberType] ?? '',
          activityOf(member),
          member.district ?? '',
          member.planName,
          ACCOUNT_STATUS_LABELS[member.accountStatus] ?? ACCOUNT_STATUS_LABELS.active,
        ]),
      };
    },
  },
  {
    type: 'paidMembers',
    title: 'Afiliados con membresía paga',
    filters: [...MEMBER_FILTERS, 'plan'],
    columns: ['Comercio', 'Código', 'Distrito', 'Plan', 'Vence'],
    async load(filters, now, store) {
      const members = (await loadMembers(filters, now, store)).filter((member) =>
        PAID_PLANS.includes(member.planKey),
      );

      return {
        summary: [
          { label: 'Total', value: String(members.length) },
          countBy(members, 'Lite MiPyme', (member) => member.planKey === PLAN_KEYS.LITE),
          countBy(members, 'Pro Pymex', (member) => member.planKey === PLAN_KEYS.PRO),
          countBy(members, 'Premium Empresarial', (member) => member.planKey === PLAN_KEYS.PREMIUM),
        ],
        rows: members.map((member) => [
          business(member),
          code(member),
          member.district ?? '',
          member.planName,
          formatDay(member.expiresAt),
        ]),
      };
    },
  },
  {
    type: 'freeMembers',
    title: 'Afiliados con membresía no paga',
    filters: MEMBER_FILTERS,
    columns: ['Comercio', 'Código', 'Tipo', 'Distrito', 'Afiliado desde'],
    async load(filters, now, store) {
      const members = await loadMembers({ ...filters, plan: PLAN_KEYS.FREE }, now, store);

      return {
        summary: [{ label: 'Total', value: String(members.length) }],
        rows: members.map((member) => [
          business(member),
          code(member),
          MEMBER_TYPE_LABELS[member.memberType] ?? '',
          member.district ?? '',
          formatDay(member.reviewedAt),
        ]),
      };
    },
  },
  {
    type: 'newMembers',
    title: 'Nuevos afiliados del período',
    filters: [...MEMBER_FILTERS, 'from', 'to'],
    columns: ['Comercio', 'Código', 'Tipo', 'Distrito', 'Aprobado'],
    async load(filters, now, store) {
      const members = (await loadMembers(filters, now, store)).filter(
        (member) =>
          member.reviewedAt !== null &&
          member.reviewedAt !== undefined &&
          (filters.from === null || member.reviewedAt >= filters.from) &&
          (filters.to === null || member.reviewedAt <= filters.to),
      );

      return {
        summary: [{ label: 'Total', value: String(members.length) }],
        rows: members.map((member) => [
          business(member),
          code(member),
          MEMBER_TYPE_LABELS[member.memberType] ?? '',
          member.district ?? '',
          formatDay(member.reviewedAt),
        ]),
      };
    },
  },
  {
    type: 'expiringMemberships',
    title: 'Membresías por vencer',
    filters: [...MEMBER_FILTERS, 'plan', 'to'],
    columns: ['Comercio', 'Código', 'Plan', 'Vence', 'Días restantes'],
    async load(filters, now, store) {
      // Until the day chosen, or within the notice the chamber sends reminders in.
      const until =
        filters.to ??
        new Date(now.getTime() + (await store.readNoticeDays()) * DAY_IN_MILLISECONDS);
      const members = (await loadMembers(filters, now, store))
        .filter((member) => member.expiresAt !== null && member.expiresAt <= until)
        .sort((first, second) => first.expiresAt - second.expiresAt);

      return {
        summary: [{ label: 'Total', value: String(members.length) }],
        rows: members.map((member) => [
          business(member),
          code(member),
          member.planName,
          formatDay(member.expiresAt),
          String(Math.max(0, Math.ceil((member.expiresAt - now) / DAY_IN_MILLISECONDS))),
        ]),
      };
    },
  },
  {
    type: 'activeVacancies',
    title: 'Vacantes activas',
    filters: [...PLACE_FILTERS, 'from', 'to'],
    columns: ['Puesto', 'Comercio', 'Distrito', 'Jornada', 'Publicada'],
    async load(filters, now, store) {
      // The board shows only vacancies of members whose plan lets them publish,
      // and the report counts what the board shows.
      const publishing = new Set((await store.findPublishingMembers(now)).map(String));
      const vacancies = (
        await store.findVacancies({
          status: VACANCY_STATUSES.ACTIVE,
          removedAt: null,
          ...rangeFilter('publishedAt', filters),
        })
      )
        .filter(
          (vacancy) =>
            vacancy.member !== null &&
            publishing.has(String(vacancy.member._id)) &&
            (filters.canton === null || String(vacancy.member.canton) === filters.canton) &&
            (filters.district === null || vacancy.member.district === filters.district),
        )
        .sort((first, second) => second.publishedAt - first.publishedAt);

      return {
        summary: [{ label: 'Total', value: String(vacancies.length) }],
        rows: vacancies.map((vacancy) => [
          vacancy.title,
          vacancy.member.businessName,
          vacancy.member.district ?? '',
          WORKDAY_LABELS[vacancy.workday] ?? '',
          formatDay(vacancy.publishedAt),
        ]),
      };
    },
  },
  {
    type: 'periodPayments',
    title: 'Pagos del período',
    filters: [...PLACE_FILTERS, 'plan', 'from', 'to'],
    columns: ['Comercio', 'Código', 'Plan', 'Frecuencia', 'Monto', 'Aprobado'],
    async load(filters, now, store) {
      const payments = (
        await store.findPayments({
          status: PAYMENT_STATUSES.APPROVED,
          ...(filters.plan === null ? {} : { planKey: filters.plan }),
          ...rangeFilter('decidedAt', filters),
        })
      )
        .filter(
          (payment) =>
            payment.member !== null &&
            (filters.canton === null || String(payment.member.canton) === filters.canton) &&
            (filters.district === null || payment.member.district === filters.district),
        )
        .sort((first, second) => second.decidedAt - first.decidedAt);
      const total = payments.reduce((sum, payment) => sum + payment.amount, 0);

      return {
        summary: [
          { label: 'Pagos aprobados', value: String(payments.length) },
          { label: 'Monto total', value: formatColones(total) },
        ],
        rows: payments.map((payment) => [
          payment.member.businessName,
          formatMemberCode(payment.member.memberCode),
          payment.planName,
          FREQUENCY_LABELS[payment.frequency] ?? '',
          formatColones(payment.amount),
          formatDay(payment.decidedAt),
        ]),
      };
    },
  },
  {
    type: 'subscribers',
    title: 'Suscriptores',
    filters: [...PLACE_FILTERS, 'from', 'to'],
    columns: ['Nombre', 'Correo', 'Cantón', 'Distrito', 'Estado', 'Suscrito desde'],
    async load(filters, now, store) {
      const subscribers = (
        await store.findSubscribers({
          ...(filters.canton === null ? {} : { canton: objectId(filters.canton) }),
          ...(filters.district === null ? {} : { district: filters.district }),
          ...rangeFilter('consentedAt', filters),
        })
      ).sort((first, second) => SPANISH_ORDER.compare(first.name, second.name));

      return {
        summary: [
          { label: 'Total', value: String(subscribers.length) },
          countBy(
            subscribers,
            'Suscritos',
            (entry) => entry.status === SUBSCRIBER_STATUSES.SUBSCRIBED,
          ),
          countBy(
            subscribers,
            'Dados de baja',
            (entry) => entry.status === SUBSCRIBER_STATUSES.UNSUBSCRIBED,
          ),
        ],
        rows: subscribers.map((entry) => [
          entry.name,
          entry.email,
          entry.canton?.name ?? '',
          entry.district,
          SUBSCRIBER_STATUS_LABELS[entry.status] ?? '',
          formatDay(entry.consentedAt),
        ]),
      };
    },
  },
  {
    type: 'products',
    title: 'Productos y servicios activos',
    filters: [...PLACE_FILTERS, 'from', 'to'],
    columns: ['Publicación', 'Comercio', 'Tipo', 'Categoría', 'Precio', 'Publicada'],
    async load(filters, now, store) {
      const publications = await loadVisiblePublications(filters, now, store, [
        PUBLICATION_TYPES.PRODUCT,
        PUBLICATION_TYPES.SERVICE,
      ]);

      return {
        summary: [
          { label: 'Total', value: String(publications.length) },
          countBy(publications, 'Productos', (item) => item.type === PUBLICATION_TYPES.PRODUCT),
          countBy(publications, 'Servicios', (item) => item.type === PUBLICATION_TYPES.SERVICE),
        ],
        rows: publications.map((publication) => [
          publication.title,
          publication.member.businessName,
          PUBLICATION_TYPE_LABELS[publication.type] ?? '',
          categoryOf(publication),
          formatColones(publication.price),
          formatDay(publication.publishedAt),
        ]),
      };
    },
  },
  {
    type: 'promotions',
    title: 'Promociones activas',
    filters: [...PLACE_FILTERS, 'from', 'to'],
    columns: ['Promoción', 'Comercio', 'Distrito', 'Empieza', 'Termina', 'Publicada'],
    async load(filters, now, store) {
      const promotions = await loadVisiblePublications(filters, now, store, [
        PUBLICATION_TYPES.PROMOTION,
      ]);

      return {
        summary: [{ label: 'Total', value: String(promotions.length) }],
        rows: promotions.map((promotion) => [
          promotion.title,
          promotion.member.businessName,
          promotion.member.district ?? '',
          formatDay(promotion.startsAt),
          formatDay(promotion.endsAt),
          formatDay(promotion.publishedAt),
        ]),
      };
    },
  },
  {
    type: 'discounts',
    title: 'Descuentos para afiliados activos',
    filters: [...PLACE_FILTERS, 'from', 'to'],
    columns: ['Descuento', 'Comercio', 'Distrito', 'Porcentaje', 'Condición', 'Publicado'],
    async load(filters, now, store) {
      const discounts = await loadVisiblePublications(filters, now, store, [
        PUBLICATION_TYPES.DISCOUNT,
      ]);

      return {
        summary: [{ label: 'Total', value: String(discounts.length) }],
        rows: discounts.map((discount) => [
          discount.title,
          discount.member.businessName,
          discount.member.district ?? '',
          percentageOf(discount),
          discount.condition ?? '',
          formatDay(discount.publishedAt),
        ]),
      };
    },
  },
];

module.exports = { REPORTS, defaultReportStore, loadMembers };
