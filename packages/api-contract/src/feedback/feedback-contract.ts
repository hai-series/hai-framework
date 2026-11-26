import { paginatedSchema } from '../common/pagination-schemas.js'
import { haiResultSchema } from '../common/result-schemas.js'
import { route } from '../common/route.js'
import {
  FeedbackAddMessageInputSchema,
  FeedbackAttachmentDataSchema,
  FeedbackAttachmentQuerySchema,
  FeedbackDetailSchema,
  FeedbackIdInputSchema,
  FeedbackLimitsSchema,
  FeedbackListInputSchema,
  FeedbackMessageQuerySchema,
  FeedbackMessageSchema,
  FeedbackReportSchema,
  FeedbackSetStatusInputSchema,
  FeedbackSubmitInputSchema,
} from './feedback-schemas.js'

/** 宿主按需挂载的反馈契约；身份和业务范围来自服务端授权。 */
export const feedbackContract = {
  limits: route({
    method: 'GET',
    path: '/feedback/limits',
    operationId: 'feedback.limits',
    summary: 'Read the current feedback submission and capture limits',
    tags: ['feedback'],
  }).output(haiResultSchema(FeedbackLimitsSchema)),
  reports: {
    submit: route({
      method: 'POST',
      path: '/feedback/reports',
      operationId: 'feedback.reports.submit',
      summary: 'Submit feedback with selected files and diagnostics',
      tags: ['feedback'],
    }).input(FeedbackSubmitInputSchema).output(haiResultSchema(FeedbackReportSchema)),
    list: route({
      method: 'GET',
      path: '/feedback/reports',
      operationId: 'feedback.reports.list',
      summary: 'List authorized reports',
      tags: ['feedback'],
    }).input(FeedbackListInputSchema).output(haiResultSchema(paginatedSchema(FeedbackReportSchema))),
    listMine: route({
      method: 'GET',
      path: '/feedback/my-reports',
      operationId: 'feedback.reports.listMine',
      summary: 'List own reports',
      tags: ['feedback'],
    }).input(FeedbackListInputSchema).output(haiResultSchema(paginatedSchema(FeedbackReportSchema))),
    get: route({
      method: 'GET',
      path: '/feedback/reports/{id}',
      operationId: 'feedback.reports.get',
      summary: 'Read feedback and original attachment metadata',
      tags: ['feedback'],
    }).input(FeedbackIdInputSchema).output(haiResultSchema(FeedbackDetailSchema)),
    listMessages: route({
      method: 'GET',
      path: '/feedback/reports/{id}/messages',
      operationId: 'feedback.reports.listMessages',
      summary: 'Read the feedback conversation',
      tags: ['feedback'],
    }).input(FeedbackMessageQuerySchema).output(haiResultSchema(paginatedSchema(FeedbackMessageSchema))),
    addMessage: route({
      method: 'POST',
      path: '/feedback/reports/{id}/messages',
      operationId: 'feedback.reports.addMessage',
      summary: 'Reply or request more information with files',
      tags: ['feedback'],
    }).input(FeedbackAddMessageInputSchema).output(haiResultSchema(FeedbackMessageSchema)),
    setStatus: route({
      method: 'PATCH',
      path: '/feedback/reports/{id}/status',
      operationId: 'feedback.reports.setStatus',
      summary: 'Mark feedback pending or handled',
      tags: ['feedback'],
    }).input(FeedbackSetStatusInputSchema).output(haiResultSchema(FeedbackReportSchema)),
  },
  attachments: {
    get: route({
      method: 'GET',
      path: '/feedback/reports/{id}/attachments/{attachmentId}',
      operationId: 'feedback.attachments.get',
      summary: 'Read an authorized attachment',
      tags: ['feedback'],
    }).input(FeedbackAttachmentQuerySchema).output(haiResultSchema(FeedbackAttachmentDataSchema)),
  },
}

export type FeedbackContract = typeof feedbackContract
