import mongoose from 'mongoose';

const PromocodeSchema = new mongoose.Schema(
  {
    
    promocode: {
      type: String
    },
    balance: {
      type: Number
    },
    isActive: {
      type: Boolean,
    },

  },
  {
    timestamps: true,
  }
);

export default mongoose.model('Promocode', PromocodeSchema);

