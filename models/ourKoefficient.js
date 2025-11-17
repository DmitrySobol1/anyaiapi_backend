import mongoose from 'mongoose';

const OurKoefficientSchema = new mongoose.Schema(
  {
    value: {
      type: Number,
    },
    valuteRate: {
      type: Number,
    },

    
    
    
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('OurKoefficient', OurKoefficientSchema);

