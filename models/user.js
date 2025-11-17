import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    tlgid: {
      type: Number,
      required: true,
      unique: true,
    },
    jbid: {
      type: Number,
    },
    name: {
      type: String,
    },
    
    balance: {
      type: Number,
      default: 0
    }
    
    
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('User', UserSchema);

