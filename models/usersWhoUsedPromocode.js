import mongoose from 'mongoose';

const UsersWhoUsedPromocodeSchema = new mongoose.Schema(
  {
    userLink: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserModel',
    },
    userTlg: {
      type: Number,
    },
    promocodeLink: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PromocodeModel',
    },
    balanceWasPresented: {
      type: Number,
    },
   
  },
  {
    timestamps: true,
  }
);

export default mongoose.model(
  'UsersWhoUsedPromocode',
  UsersWhoUsedPromocodeSchema
);
