import mongoose from 'mongoose';

const UserChoosedModelsSchema = new mongoose.Schema(
  {
    aiModelLink: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AiModel',
      required: true,
    },
    userLink: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tlgid: {
      type: String
    },
    token: {
      type: String,
    },

  },
  {
    timestamps: true,
  }
);

export default mongoose.model('UserChoosedModels', UserChoosedModelsSchema);

