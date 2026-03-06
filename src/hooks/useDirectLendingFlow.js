
import { useDataContext } from '../utils/NavigationContext';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL 
const NILA_TOKEN = process.env.REACT_APP_NILA_TOKEN

const useLendingFlow = () => {
    const { db } = useDataContext();

    const handleIssueVoucher = async (fund,LAND,CAP,amount,chosenRateBP) => {
        console.log("CAP", fund )
        console.log("API_BASE_URL", API_BASE_URL )
        const voucher_url = `${API_BASE_URL}/issue_voucher/`;
        const voucher_data = {
          'fund': JSON.stringify(fund),
          'amount': amount ? amount.toString() : '0',
          'landID': LAND?.current ? LAND.current.LAND.id : 'None', // has to be a string
          'address': db?.address,
          'unionaddress': db?.union?.address,
          'chain': db?.chain,
          'token': NILA_TOKEN,
          'selfclaimedCap': CAP ? CAP.current.toString() : 'None',
          ...(chosenRateBP != null && { 'chosenRateBP': chosenRateBP.toString() })
        };
        console.log("voucher_data", voucher_data )
        try {
            const VoucherResponse = await axios.post(voucher_url, voucher_data, {
              headers: {'Content-Type': 'application/json'}
            });
            console.log('Voucher Response:', VoucherResponse.data);
            return VoucherResponse.data
          } catch (error) {
            console.error('Error:', error.response ? error.response.data : error.message);
          }
    }

    const handleIssueTokenVoucher = async (LAND,form,props) => {
        console.log("LAND", LAND.current.LAND.id )
        console.log('props', props)
        const voucher_url = `${API_BASE_URL}/issue_voucher/token`;
        const voucher_data = {
          'to': db?.address,
          'landID': LAND.current ? LAND.current.LAND.id : '0', // has to be a string
          'crop': form.crop,
          'var': form.var,
          'size_ft': props.reduce((a, n) => a + n, 0),
          'unionaddress': db?.union?.address,
          'chain': db?.chain,
        };
        try {
            const VoucherResponse = await axios.post(voucher_url, voucher_data, {
              headers: {'Content-Type': 'application/json'}
            });
            console.log('Voucher Response:', VoucherResponse.data);
            return VoucherResponse.data
          } catch (error) {
            console.error('Error:', error.response ? error.response.data : error.message);
          }
    }

  return { handleIssueVoucher, handleIssueTokenVoucher };
};

export default useLendingFlow;
