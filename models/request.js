import mongoose from 'mongoose';

const RequestSchema = new mongoose.Schema(
  {
    aiModelLink: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AiModel',
      required: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    ownerTlg: {
      type: String
    },
    inputFromRequest: {
      type: String
    },
    isAuthorised: {
      type: Boolean,
    },
    inputTokens: {
      type: Number
    },
    outputTokens: {
      type: Number
    },
    isRqstOperated: {
       type: Boolean,     
    },
    priceBasicForInputTokensUsd: {
      type: Number
    },
    priceBasicForOutputTokensUsd: {
      type: Number
    },
    priceOurTotalAllRqstRub: {
      type: Number
    },
    rate: {
      type: Number
    }

  },
  {
    timestamps: true,
  }
);

export default mongoose.model('Request', RequestSchema);

